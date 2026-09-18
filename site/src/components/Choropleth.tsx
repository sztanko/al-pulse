/** Every locality in Portugal over a real vector basemap.
 *
 * MapLibre GL, as madeira-pass uses — but pointed at OpenFreeMap rather than
 * CARTO. CARTO's basemaps need a key for production use, which is exactly what
 * put "API KEY REQUIRED" across the whole country on the Evidence map.
 * OpenFreeMap serves OpenMapTiles-schema vector tiles, glyphs and sprites with
 * no key, no signup and no quota, and ships both a light and a dark style from
 * the same source so the map can follow the page theme.
 *
 * The choropleth is a fill layer over that basemap, coloured by a `step`
 * expression over quantile breaks computed from the data at load. Hit-testing
 * is MapLibre's own `queryRenderedFeatures`, and hover state rides on
 * feature-state so no layer is rebuilt per pointer move.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import maplibregl, { type Map as MLMap, type StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import './Choropleth.css';

type Metric = 'rank_within_country' | 'al_count' | 'people_per_al';

interface Props {
  geoUrl: string;
  base: string;
  steps?: number;
}

interface Hovered {
  slug: string;
  name: string;
  full: string;
  al: number | null;
  rank: number | null;
  ppa: number | null;
  pop: number | null;
  x: number;
  y: number;
}

/** `lo`/`hi` label the ends of the ramp. "Darker" would be wrong in one theme
 * or the other: the light ramp runs pale -> deep red and the dark ramp runs
 * near-black -> bright apricot. Both run subtle -> strong, so the legend is
 * written in those terms and the ends say which is which. */
const METRICS: {
  key: Metric; label: string; hint: string; invert: boolean; lo: string; hi: string;
}[] = [
  {
    key: 'rank_within_country', label: 'Rank by ALs', invert: true,
    hint: 'stronger colour = higher up the national ranking',
    lo: 'lowest ranked', hi: 'rank 1',
  },
  {
    key: 'al_count', label: 'Number of ALs', invert: false,
    hint: 'stronger colour = more registrations',
    lo: 'fewest', hi: 'most',
  },
  {
    key: 'people_per_al', label: 'Residents per AL', invert: true,
    hint: 'stronger colour = denser (fewer residents per registration)',
    lo: 'least dense', hi: 'densest',
  },
];

const LIGHT_STYLE = 'https://tiles.openfreemap.org/styles/positron';
const DARK_STYLE = 'https://tiles.openfreemap.org/styles/dark';

const MAINLAND: [number, number, number, number] = [-9.6, 36.9, -6.1, 42.2];
const MADEIRA: [number, number, number, number] = [-17.3, 32.6, -16.2, 33.15];

const SRC = 'localities';
const FILL = 'localities-fill';
const LINE = 'localities-line';
const HOVER = 'localities-hover';

const n0 = (v: number | null) => (v == null ? '—' : Math.round(v).toLocaleString('en-GB'));

const isDark = () => {
  const attr = document.documentElement.getAttribute('data-theme');
  if (attr === 'dark') return true;
  if (attr === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
};

const rampVars = (steps: number): string[] => {
  const cs = getComputedStyle(document.documentElement);
  return Array.from({ length: steps }, (_, i) =>
    cs.getPropertyValue(`--m-seq-${i + 1}`).trim() || '#ccc'
  );
};

export default function Choropleth({ geoUrl, base, steps = 9 }: Props) {
  const holderRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MLMap | null>(null);
  const hoverIdRef = useRef<number | string | null>(null);
  const pinnedRef = useRef(false);

  const [metric, setMetric] = useState<Metric>('rank_within_country');
  const [hovered, setHovered] = useState<Hovered | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const breaksRef = useRef<Record<Metric, number[]>>({
    rank_within_country: [],
    al_count: [],
    people_per_al: [],
  });

  /** Quantile breaks, so each shade holds the same number of localities — a
   * handful of places otherwise dwarf the rest and the ramp goes unused. */
  const computeBreaks = useCallback(
    (features: GeoJSON.Feature[]) => {
      const out = {} as Record<Metric, number[]>;
      for (const m of METRICS) {
        const vals = features
          .map((f) => f.properties?.[m.key])
          .filter((v): v is number => typeof v === 'number')
          .sort((a, b) => a - b);
        const cuts: number[] = [];
        for (let i = 1; i < steps; i++) {
          const v = vals[Math.floor((i / steps) * vals.length)];
          if (typeof v === 'number') cuts.push(v);
        }
        // `step` needs strictly ascending stops; ties would throw.
        out[m.key] = cuts.filter((v, i, a) => i === 0 || v > (a[i - 1] ?? -Infinity));
      }
      return out;
    },
    [steps]
  );

  const fillExpression = useCallback(
    (m: Metric): unknown => {
      const ramp = rampVars(steps);
      const cuts = breaksRef.current[m] ?? [];
      const inv = METRICS.find((x) => x.key === m)?.invert ?? false;
      const shade = (i: number) => ramp[inv ? ramp.length - 1 - i : i] ?? ramp[0] ?? '#ccc';
      if (!cuts.length) return shade(0);
      const expr: unknown[] = ['step', ['to-number', ['get', m], -1], shade(0)];
      cuts.forEach((c, i) => expr.push(c, shade(Math.min(i + 1, ramp.length - 1))));
      return expr;
    },
    [steps]
  );

  /** Add our own layers on top of whichever basemap style is loaded. */
  const addLayers = useCallback(
    (map: MLMap, data: GeoJSON.FeatureCollection) => {
      if (!map.getSource(SRC)) {
        map.addSource(SRC, { type: 'geojson', data, promoteId: 'id' });
      }
      const dark = isDark();
      if (!map.getLayer(FILL)) {
        map.addLayer({
          id: FILL,
          type: 'fill',
          source: SRC,
          paint: {
            'fill-color': fillExpression(metric) as never,
            'fill-opacity': [
              'case',
              ['boolean', ['feature-state', 'hover'], false],
              0.95,
              0.72,
            ] as never,
          },
        });
      }
      if (!map.getLayer(LINE)) {
        map.addLayer({
          id: LINE,
          type: 'line',
          source: SRC,
          paint: {
            'line-color': dark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.16)',
            'line-width': 0.4,
          },
        });
      }
      if (!map.getLayer(HOVER)) {
        map.addLayer({
          id: HOVER,
          type: 'line',
          source: SRC,
          paint: {
            'line-color': dark ? '#fff' : '#111',
            'line-width': [
              'case',
              ['boolean', ['feature-state', 'hover'], false],
              2,
              0,
            ] as never,
          },
        });
      }
    },
    [fillExpression, metric]
  );

  /* ------------------------------------------------------------------ init */
  useEffect(() => {
    const holder = holderRef.current;
    if (!holder || mapRef.current) return;

    setNarrow(holder.clientWidth < 560);

    const map = new maplibregl.Map({
      container: holder,
      style: (isDark() ? DARK_STYLE : LIGHT_STYLE) as unknown as StyleSpecification,
      bounds: MAINLAND,
      fitBoundsOptions: { padding: 24 },
      attributionControl: false,
      // Keep the interaction simple: this is a choropleth, not a flight sim.
      pitchWithRotate: false,
      dragRotate: false,
      touchZoomRotate: true,
    });
    mapRef.current = map;

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    // No customAttribution: the OpenFreeMap style already declares OpenFreeMap,
    // OpenMapTiles and OpenStreetMap. Adding our own duplicated all three and,
    // at 360px, the two halves of the bar overlapped each other — the verifier
    // caught it as a link covered by a link.
    map.addControl(new maplibregl.AttributionControl({ compact: true }));

    let data: GeoJSON.FeatureCollection | null = null;

    map.on('error', (e) => {
      const msg = String((e as { error?: Error }).error ?? e);
      // Missing glyphs for one label are not worth failing the page over.
      if (/font|glyph|sprite/i.test(msg)) return;
      setErr(msg.slice(0, 160));
    });

    const load = fetch(geoUrl)
      .then((r) => {
        if (!r.ok) throw new Error(`geometry ${r.status}`);
        return r.json();
      })
      .then((gj: GeoJSON.FeatureCollection) => {
        data = gj;
        breaksRef.current = computeBreaks(gj.features ?? []);
      })
      .catch((e) => setErr(String(e).slice(0, 160)));

    map.on('load', async () => {
      await load;
      if (!data) return;
      addLayers(map, data);
      setReady(true);
    });

    // Re-add our layers after a basemap style swap: setStyle discards them.
    map.on('styledata', () => {
      if (!data || !map.isStyleLoaded()) return;
      if (!map.getLayer(FILL)) addLayers(map, data);
    });

    const move = (e: maplibregl.MapMouseEvent) => {
      if (pinnedRef.current) return;
      const hits = map.queryRenderedFeatures(e.point, { layers: [FILL] });
      const f = hits[0];
      if (!f) {
        if (hoverIdRef.current != null) {
          map.setFeatureState({ source: SRC, id: hoverIdRef.current }, { hover: false });
          hoverIdRef.current = null;
        }
        setHovered(null);
        return;
      }
      if (hoverIdRef.current !== f.id) {
        if (hoverIdRef.current != null)
          map.setFeatureState({ source: SRC, id: hoverIdRef.current }, { hover: false });
        hoverIdRef.current = f.id ?? null;
        if (hoverIdRef.current != null)
          map.setFeatureState({ source: SRC, id: hoverIdRef.current }, { hover: true });
      }
      const p = f.properties ?? {};
      setHovered({
        slug: String(p.slug ?? ''),
        name: String(p.name ?? ''),
        full: String(p.full_name ?? ''),
        al: typeof p.al_count === 'number' ? p.al_count : Number(p.al_count) || null,
        rank:
          typeof p.rank_within_country === 'number'
            ? p.rank_within_country
            : Number(p.rank_within_country) || null,
        ppa: typeof p.people_per_al === 'number' ? p.people_per_al : Number(p.people_per_al) || null,
        pop: typeof p.population === 'number' ? p.population : Number(p.population) || null,
        x: e.point.x,
        y: e.point.y,
      });
    };

    map.on('mousemove', FILL, move);
    map.on('mouseleave', FILL, () => {
      if (pinnedRef.current) return;
      if (hoverIdRef.current != null)
        map.setFeatureState({ source: SRC, id: hoverIdRef.current }, { hover: false });
      hoverIdRef.current = null;
      setHovered(null);
    });

    // Touch: a tap opens the readout and it stays until the next tap elsewhere.
    map.on('click', FILL, (e) => {
      move(e);
      pinnedRef.current = true;
      setTimeout(() => {
        const off = () => {
          pinnedRef.current = false;
          setHovered(null);
          document.removeEventListener('pointerdown', off, true);
        };
        document.addEventListener('pointerdown', off, true);
      }, 80);
    });

    // The first fitBounds runs against the container's pre-layout size, which
    // left Portugal sitting right of centre. Re-fit once, after the element has
    // settled at its real width.
    let refitted = false;
    const ro = new ResizeObserver(() => {
      setNarrow(holder.clientWidth < 560);
      map.resize();
      if (!refitted && holder.clientWidth > 0) {
        refitted = true;
        map.fitBounds(MAINLAND, { padding: 24, duration: 0 });
      }
    });
    ro.observe(holder);

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, [geoUrl, addLayers, computeBreaks]);

  /* ------------------------------------------------------ theme + metric */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const swap = () => map.setStyle((isDark() ? DARK_STYLE : LIGHT_STYLE) as unknown as StyleSpecification);
    const mo = new MutationObserver(swap);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', swap);
    return () => {
      mo.disconnect();
      mq.removeEventListener('change', swap);
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !map.getLayer(FILL)) return;
    map.setPaintProperty(FILL, 'fill-color', fillExpression(metric) as never);
  }, [metric, ready, fillExpression]);

  const flyTo = (b: [number, number, number, number]) =>
    mapRef.current?.fitBounds(b, { padding: 24, duration: 700 });

  const active = useMemo(
    () => METRICS.find((m) => m.key === metric) ?? METRICS[0]!,
    [metric]
  );
  const hint = active.hint;

  return (
    <div className="ch">
      <div className="ch-controls">
        <div className="ch-metrics" role="group" aria-label="Colour the map by">
          {METRICS.map((mm) => (
            <button
              key={mm.key}
              type="button"
              className={metric === mm.key ? 'is-on' : ''}
              aria-pressed={metric === mm.key}
              onClick={() => setMetric(mm.key)}
            >
              {mm.label}
            </button>
          ))}
        </div>
        <div className="ch-zoom" role="group" aria-label="Jump to">
          <button type="button" onClick={() => flyTo(MAINLAND)}>Mainland</button>
          <button type="button" onClick={() => flyTo(MADEIRA)}>Madeira</button>
        </div>
      </div>

      <div className="ch-legend">
        <span className="small faint">{hint}</span>
        <span className="ch-scale">
          <span className="small faint">{active.lo}</span>
          <span className="ch-ramp" aria-hidden="true">
            {Array.from({ length: steps }, (_, i) => (
              <i key={i} style={{ background: `var(--m-seq-${i + 1})` }} />
            ))}
          </span>
          <span className="small faint">{active.hi}</span>
        </span>
      </div>

      <div className="ch-stage">
        <div
          ref={holderRef}
          className="ch-map"
          role="application"
          aria-label="Map of Portuguese localities by registered short-lets"
        />

        {err && (
          <p className="ch-loading muted">
            The map could not load ({err}). Every locality is still listed on the{' '}
            <a href={`${base}/areas`}>areas index</a>.
          </p>
        )}
        {!ready && !err && <p className="ch-loading muted">Loading the map…</p>}

        {hovered && (
          <div
            className={`ch-readout${narrow ? ' is-pinned' : ''}`}
            style={
              narrow
                ? undefined
                : { left: `${hovered.x + 14}px`, top: `${Math.max(8, hovered.y - 10)}px` }
            }
            role="status"
          >
            <div className="ch-readout-name">{hovered.name}</div>
            <div className="ch-readout-sub small faint">{hovered.full}</div>
            <dl>
              <div><dt>Registered ALs</dt><dd className="num">{n0(hovered.al)}</dd></div>
              <div><dt>Rank in Portugal</dt><dd className="num">{n0(hovered.rank)}</dd></div>
              <div><dt>Residents per AL</dt><dd className="num">{n0(hovered.ppa)}</dd></div>
              <div><dt>Population</dt><dd className="num">{n0(hovered.pop)}</dd></div>
            </dl>
            {hovered.slug && <a href={`${base}/areas/${hovered.slug}`}>Open {hovered.name} →</a>}
          </div>
        )}
      </div>
    </div>
  );
}
