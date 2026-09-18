/** Every locality in Portugal, drawn from the geometry itself.
 *
 * Canvas rather than 2,471 DOM nodes: past a few thousand marks layout cost
 * stops being invisible, and pan/zoom has to stay at frame rate. Hit-testing
 * is a second, offscreen canvas painted with one unique colour per feature, so
 * "which polygon is under the pointer" is a single pixel read rather than a
 * point-in-polygon sweep.
 *
 * No basemap tiles. Evidence pulled CARTO tiles and rendered an "API KEY
 * REQUIRED" watermark across the whole country on the live site; the polygons
 * are the data, and they carry themselves.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './Choropleth.css';

type Metric = 'rank_within_country' | 'al_count' | 'people_per_al';

interface Props {
  geoUrl: string;
  base: string;
  /** Ramp tokens, light → dark. */
  steps?: number;
}

interface Feat {
  slug: string;
  name: string;
  full: string;
  al: number | null;
  rank: number | null;
  ppa: number | null;
  pop: number | null;
  rings: Float64Array[];
  bbox: [number, number, number, number];
}

const METRICS: { key: Metric; label: string; hint: string; invert: boolean }[] = [
  { key: 'rank_within_country', label: 'Rank by ALs', hint: 'darker = higher rank', invert: true },
  { key: 'al_count', label: 'Number of ALs', hint: 'darker = more', invert: false },
  { key: 'people_per_al', label: 'Residents per AL', hint: 'darker = denser', invert: true },
];

/** Longitudes west of this are the Madeira archipelago, not the mainland. */
const MAINLAND_W = -12;

const n0 = (v: number | null) => (v == null ? '—' : Math.round(v).toLocaleString('en-GB'));

export default function Choropleth({ geoUrl, base, steps = 9 }: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const cvsRef = useRef<HTMLCanvasElement | null>(null);
  const pickRef = useRef<HTMLCanvasElement | null>(null);
  const [feats, setFeats] = useState<Feat[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [metric, setMetric] = useState<Metric>('rank_within_country');
  const [size, setSize] = useState({ w: 900, h: 640 });
  const [view, setView] = useState({ k: 1, tx: 0, ty: 0 });
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [pointer, setPointer] = useState({ x: 0, y: 0 });
  const [pinned, setPinned] = useState(false);
  const rampRef = useRef<string[]>([]);
  const dragRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);

  /* ----------------------------------------------------------- load + fit */
  useEffect(() => {
    let alive = true;
    fetch(geoUrl)
      .then((r) => {
        if (!r.ok) throw new Error(`geometry ${r.status}`);
        return r.json();
      })
      .then((gj) => {
        if (!alive) return;
        const out: Feat[] = [];
        for (const f of gj.features ?? []) {
          const p = f.properties ?? {};
          const polys =
            f.geometry?.type === 'Polygon'
              ? [f.geometry.coordinates]
              : f.geometry?.type === 'MultiPolygon'
                ? f.geometry.coordinates
                : [];
          const rings: Float64Array[] = [];
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          for (const poly of polys) {
            for (const ring of poly) {
              const arr = new Float64Array(ring.length * 2);
              for (let i = 0; i < ring.length; i++) {
                const lon = ring[i][0];
                const lat = ring[i][1];
                arr[i * 2] = lon;
                arr[i * 2 + 1] = lat;
                if (lon < minX) minX = lon;
                if (lon > maxX) maxX = lon;
                if (lat < minY) minY = lat;
                if (lat > maxY) maxY = lat;
              }
              rings.push(arr);
              break; // outer ring only: holes are invisible at this scale
            }
          }
          if (!rings.length) continue;
          out.push({
            slug: p.slug,
            name: p.name,
            full: p.full_name,
            al: p.al_count ?? null,
            rank: p.rank_within_country ?? null,
            ppa: p.people_per_al ?? null,
            pop: p.population ?? null,
            rings,
            bbox: [minX, minY, maxX, maxY],
          });
        }
        setFeats(out);
      })
      .catch((e) => alive && setErr(String(e)));
    return () => {
      alive = false;
    };
  }, [geoUrl]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth || 900;
      setSize({ w, h: Math.max(380, Math.min(760, Math.round(w * 1.05))) });
    });
    ro.observe(el);
    const w = el.clientWidth || 900;
    setSize({ w, h: Math.max(380, Math.min(760, Math.round(w * 1.05))) });
    return () => ro.disconnect();
  }, []);

  /** Read the ramp out of CSS so it follows the theme. */
  useEffect(() => {
    const read = () => {
      const cs = getComputedStyle(document.documentElement);
      rampRef.current = Array.from({ length: steps }, (_, i) =>
        cs.getPropertyValue(`--m-seq-${i + 1}`).trim()
      );
      setView((v) => ({ ...v })); // force a repaint with the new palette
    };
    read();
    const mo = new MutationObserver(read);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', read);
    return () => {
      mo.disconnect();
      mq.removeEventListener('change', read);
    };
  }, [steps]);

  /* ---------------------------------------------------------- projection */
  const fit = useMemo(() => {
    if (!feats?.length) return null;
    // Frame the mainland. Madeira lies about eight degrees further west, and a
    // bbox spanning both spends most of the canvas on empty Atlantic and
    // shrinks the part nearly every reader came for. Madeira is still drawn,
    // and the region buttons fly to it.
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const f of feats) {
      if (f.bbox[0] < MAINLAND_W) continue;
      if (f.bbox[0] < minX) minX = f.bbox[0];
      if (f.bbox[1] < minY) minY = f.bbox[1];
      if (f.bbox[2] > maxX) maxX = f.bbox[2];
      if (f.bbox[3] > maxY) maxY = f.bbox[3];
    }
    // Equirectangular with a cos(lat) correction — adequate over one country
    // and far cheaper than a full projection.
    const midLat = ((minY + maxY) / 2) * (Math.PI / 180);
    const kx = Math.cos(midLat);
    const w = (maxX - minX) * kx;
    const h = maxY - minY;
    return { minX, minY, maxX, maxY, kx, w, h };
  }, [feats]);

  /** Quantile bins, so the ramp uses its whole range whatever the shape. */
  const bins = useMemo(() => {
    if (!feats?.length) return null;
    const vals = feats
      .map((f) => (metric === 'al_count' ? f.al : metric === 'people_per_al' ? f.ppa : f.rank))
      .filter((v): v is number => v != null)
      .sort((a, b) => a - b);
    if (!vals.length) return null;
    const cuts: number[] = [];
    for (let i = 1; i < steps; i++) cuts.push(vals[Math.floor((i / steps) * vals.length)] ?? 0);
    return cuts;
  }, [feats, metric, steps]);

  const binOf = useCallback(
    (f: Feat): number => {
      const v = metric === 'al_count' ? f.al : metric === 'people_per_al' ? f.ppa : f.rank;
      if (v == null || !bins) return -1;
      let i = 0;
      while (i < bins.length && v > (bins[i] ?? 0)) i++;
      const invert = METRICS.find((m) => m.key === metric)?.invert ?? false;
      return invert ? steps - 1 - i : i;
    },
    [metric, bins, steps]
  );

  /* -------------------------------------------------------------- render */
  const draw = useCallback(() => {
    const cvs = cvsRef.current;
    const pick = pickRef.current;
    if (!cvs || !pick || !feats || !fit) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const { w, h } = size;
    for (const cc of [cvs, pick]) {
      cc.width = Math.round(w * dpr);
      cc.height = Math.round(h * dpr);
    }
    cvs.style.width = `${w}px`;
    cvs.style.height = `${h}px`;

    const ctx = cvs.getContext('2d');
    const pctx = pick.getContext('2d', { willReadFrequently: true });
    if (!ctx || !pctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    pctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    pctx.clearRect(0, 0, w, h);

    const pad = 10;
    const s = Math.min((w - pad * 2) / fit.w, (h - pad * 2) / fit.h) * view.k;
    const ox = (w - fit.w * s) / 2 + view.tx;
    const oy = (h - fit.h * s) / 2 + view.ty;
    const X = (lon: number) => ox + (lon - fit.minX) * fit.kx * s;
    const Y = (lat: number) => oy + (fit.maxY - lat) * s;

    const ramp = rampRef.current;
    const cs = getComputedStyle(document.documentElement);
    const stroke = cs.getPropertyValue('--s-panel').trim() || '#fff';
    const noData = cs.getPropertyValue('--s-panel-2').trim() || '#eee';

    ctx.lineJoin = 'round';
    feats.forEach((f, idx) => {
      const b = binOf(f);
      ctx.beginPath();
      pctx.beginPath();
      for (const ring of f.rings) {
        for (let i = 0; i < ring.length; i += 2) {
          const px = X(ring[i]!);
          const py = Y(ring[i + 1]!);
          if (i === 0) {
            ctx.moveTo(px, py);
            pctx.moveTo(px, py);
          } else {
            ctx.lineTo(px, py);
            pctx.lineTo(px, py);
          }
        }
        ctx.closePath();
        pctx.closePath();
      }
      ctx.fillStyle = b < 0 ? noData : (ramp[b] ?? noData);
      ctx.fill();
      if (s > 0.9) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = idx === hoverIdx ? 2 : 0.35;
        ctx.stroke();
      }
      // id+1 encoded as rgb, so 0,0,0 reads as "nothing here".
      const id = idx + 1;
      pctx.fillStyle = `rgb(${id & 255},${(id >> 8) & 255},${(id >> 16) & 255})`;
      pctx.fill();
    });

    if (hoverIdx != null && feats[hoverIdx]) {
      const f = feats[hoverIdx];
      ctx.beginPath();
      for (const ring of f.rings) {
        for (let i = 0; i < ring.length; i += 2) {
          const px = X(ring[i]!);
          const py = Y(ring[i + 1]!);
          i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.closePath();
      }
      ctx.strokeStyle = cs.getPropertyValue('--s-ink').trim() || '#000';
      ctx.lineWidth = 1.8;
      ctx.stroke();
    }
  }, [feats, fit, size, view, binOf, hoverIdx]);

  useEffect(() => {
    draw();
  }, [draw]);

  /* --------------------------------------------------------- interaction */
  const hitAt = useCallback((clientX: number, clientY: number): number | null => {
    const pick = pickRef.current;
    if (!pick) return null;
    const r = pick.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const x = Math.round((clientX - r.left) * dpr);
    const y = Math.round((clientY - r.top) * dpr);
    if (x < 0 || y < 0 || x >= pick.width || y >= pick.height) return null;
    const ctx = pick.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    const d = ctx.getImageData(x, y, 1, 1).data;
    const id = (d[0] ?? 0) | ((d[1] ?? 0) << 8) | ((d[2] ?? 0) << 16);
    return id > 0 ? id - 1 : null;
  }, []);

  useEffect(() => {
    if (!pinned) return;
    let armed = false;
    const t = setTimeout(() => (armed = true), 90);
    const off = () => { if (armed) { setPinned(false); setHoverIdx(null); } };
    document.addEventListener('pointerdown', off, true);
    return () => { clearTimeout(t); document.removeEventListener('pointerdown', off, true); };
  }, [pinned]);

  const onMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (d) {
      setView((v) => ({ ...v, tx: d.tx + (e.clientX - d.x), ty: d.ty + (e.clientY - d.y) }));
      return;
    }
    if (pinned && e.pointerType === 'touch') return;
    setPointer({ x: e.clientX, y: e.clientY });
    setHoverIdx(hitAt(e.clientX, e.clientY));
  };

  const zoomBy = (factor: number) =>
    setView((v) => ({ ...v, k: Math.max(1, Math.min(14, v.k * factor)) }));

  /** Centre on Madeira, expressed in the mainland projection so the same
   * transform drives both the visible and the hit-test canvas. */
  const madeiraView = useCallback(() => {
    if (!feats || !fit) return { k: 1, tx: 0, ty: 0 };
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const f of feats) {
      if (f.bbox[0] >= MAINLAND_W) continue;
      if (f.bbox[0] < minX) minX = f.bbox[0];
      if (f.bbox[1] < minY) minY = f.bbox[1];
      if (f.bbox[2] > maxX) maxX = f.bbox[2];
      if (f.bbox[3] > maxY) maxY = f.bbox[3];
    }
    if (!Number.isFinite(minX)) return { k: 1, tx: 0, ty: 0 };
    const { w, h } = size;
    const pad = 10;
    const base = Math.min((w - pad * 2) / fit.w, (h - pad * 2) / fit.h);
    const k = Math.max(
      1,
      Math.min(14, Math.min(fit.w / ((maxX - minX) * fit.kx), fit.h / (maxY - minY)) * 0.55)
    );
    const s2 = base * k;
    const cx = ((minX + maxX) / 2 - fit.minX) * fit.kx * s2;
    const cy = (fit.maxY - (minY + maxY) / 2) * s2;
    return {
      k,
      tx: w / 2 - cx - (w - fit.w * s2) / 2,
      ty: h / 2 - cy - (h - fit.h * s2) / 2,
    };
  }, [feats, fit, size]);

  const hovered = hoverIdx != null && feats ? feats[hoverIdx] : null;
  const wrapBox = wrapRef.current?.getBoundingClientRect();
  const narrow = size.w < 560;

  if (err) {
    return (
      <p className="muted">
        The map geometry could not be loaded ({err}). Every locality is still
        listed on the <a href={`${base}/areas`}>areas index</a>.
      </p>
    );
  }

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
        <div className="ch-zoom" role="group" aria-label="View">
          <button type="button" onClick={() => setView({ k: 1, tx: 0, ty: 0 })}>Mainland</button>
          <button type="button" onClick={() => setView(madeiraView())}>Madeira</button>
          <button type="button" onClick={() => zoomBy(1.4)} aria-label="Zoom in">+</button>
          <button type="button" onClick={() => zoomBy(1 / 1.4)} aria-label="Zoom out">−</button>
        </div>
      </div>

      <div className="ch-legend">
        <span className="small faint">{METRICS.find((mm) => mm.key === metric)?.hint}</span>
        <span className="ch-ramp" aria-hidden="true">
          {Array.from({ length: steps }, (_, i) => (
            <i key={i} style={{ background: `var(--m-seq-${i + 1})` }} />
          ))}
        </span>
      </div>

      <div className="ch-stage" ref={wrapRef}>
        <canvas
          ref={cvsRef}
          className="ch-canvas"
          role="img"
          aria-label={`Choropleth of ${feats?.length ?? 0} Portuguese localities coloured by ${
            METRICS.find((mm) => mm.key === metric)?.label
          }`}
          onPointerMove={onMove}
          onPointerLeave={(e) => {
            if (e.pointerType === 'touch') return;
            setHoverIdx(null);
          }}
          onPointerDown={(e) => {
            (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
            if (e.pointerType === 'touch') {
              setPointer({ x: e.clientX, y: e.clientY });
              setHoverIdx(hitAt(e.clientX, e.clientY));
              setPinned(true);
            }
            dragRef.current = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty };
          }}
          onPointerUp={() => (dragRef.current = null)}
          onWheel={(e) => {
            if (!e.ctrlKey && Math.abs(e.deltaY) < 2) return;
            zoomBy(e.deltaY < 0 ? 1.12 : 1 / 1.12);
          }}
        />
        <canvas ref={pickRef} className="ch-pick" aria-hidden="true" />

        {hovered && wrapBox && (
          <div
            className={`ch-readout${narrow ? ' is-pinned' : ''}`}
            style={
              narrow
                ? undefined
                : {
                    left: `${Math.min(pointer.x - wrapBox.left + 14, size.w - 230)}px`,
                    top: `${Math.max(8, pointer.y - wrapBox.top - 10)}px`,
                  }
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
            <a href={`${base}/areas/${hovered.slug}`}>Open {hovered.name} →</a>
          </div>
        )}

        {!feats && !err && <p className="ch-loading muted">Loading {`${2471}`} localities…</p>}
      </div>
    </div>
  );
}
