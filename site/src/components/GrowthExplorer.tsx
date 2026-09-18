/** Growth rebased to a month the reader chooses.
 *
 * Evidence interpolated the slider value into SQL and re-ran a DuckDB-WASM
 * query on every drag. Rebasing is just `cumulative[t] / cumulative[base]`, so
 * the client can do it on the series already shipped — same numbers, no query,
 * and it tracks the thumb instead of lagging it. That is what "seamless"
 * requires.
 *
 * Two tabbed views, matching the Evidence page: the area against its own
 * hierarchy, and the area's children against each other.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import './GrowthExplorer.css';

export interface SeriesIn {
  name: string;
  slug: string | null;
  cum: number[];
}

export interface Props {
  months: string[];
  hierarchy: SeriesIn[];
  subareas: SeriesIn[];
  events?: { month: string; label: string }[];
  /** Slider range in months back from the last observation. */
  minBack?: number;
  maxBack?: number;
  defaultBack?: number;
  height?: number;
}

const PAD = { top: 14, right: 16, bottom: 26, left: 48 };
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const CATS = ['--m-cat-1','--m-cat-2','--m-cat-3','--m-cat-4','--m-cat-5','--m-cat-6','--m-cat-7','--m-cat-8'];

const label = (m: string): string => {
  const [y, mm] = m.split('-');
  return `${MONTHS[Number(mm) - 1] ?? mm} ${y}`;
};
const longLabel = (m: string): string => {
  const [y, mm] = m.split('-');
  const full = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  return `${full[Number(mm) - 1] ?? mm} ${y}`;
};

export default function GrowthExplorer({
  months,
  hierarchy,
  subareas,
  events = [],
  minBack = 5,
  maxBack = 150,
  defaultBack = 36,
  height = 320,
}: Props) {
  const n = months.length;
  const maxB = Math.min(maxBack, n - 1);
  const [back, setBack] = useState(Math.min(defaultBack, maxB));
  const [tab, setTab] = useState<'area' | 'subareas'>('area');
  const [hover, setHover] = useState<number | null>(null);
  const [pinned, setPinned] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [w, setW] = useState(760);
  const sliderId = useId();

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth || 760));
    ro.observe(el);
    setW(el.clientWidth || 760);
    return () => ro.disconnect();
  }, []);

  const baseIdx = Math.max(0, n - 1 - back);
  const baseMonth = months[baseIdx] ?? '';
  const hasSub = subareas.length > 0;
  const active = tab === 'subareas' && hasSub ? subareas : hierarchy;

  const narrow = w < 560;
  const innerW = Math.max(120, w - PAD.left - PAD.right);
  const innerH = Math.max(90, height - PAD.top - PAD.bottom);

  /** Rebased series, and the extent across everything drawn. */
  const { drawn, lo, hi } = useMemo(() => {
    const out = active.map((s) => {
      const b = s.cum[baseIdx];
      const vals = s.cum.map((v, i) =>
        !b || v == null || i < baseIdx ? null : v / b
      );
      return { name: s.name, slug: s.slug, vals };
    });
    let mn = 1;
    let mx = 1;
    for (const s of out)
      for (const v of s.vals) {
        if (v == null) continue;
        if (v < mn) mn = v;
        if (v > mx) mx = v;
      }
    const pad = (mx - mn) * 0.06 || 0.05;
    return { drawn: out, lo: Math.max(0, mn - pad), hi: mx + pad };
  }, [active, baseIdx]);

  const x = useCallback(
    (i: number) => (n <= 1 ? 0 : (i / (n - 1)) * innerW),
    [n, innerW]
  );
  const y = useCallback(
    (v: number) => innerH - ((v - lo) / (hi - lo || 1)) * innerH,
    [innerH, lo, hi]
  );

  const paths = useMemo(
    () =>
      drawn.map((s) => {
        let d = '';
        let started = false;
        s.vals.forEach((v, i) => {
          if (v == null) return;
          d += `${started ? 'L' : 'M'}${x(i).toFixed(2)},${y(v).toFixed(2)}`;
          started = true;
        });
        return d;
      }),
    [drawn, x, y]
  );

  const yTicks = useMemo(() => {
    const out: number[] = [];
    for (let k = 0; k <= 4; k++) out.push(lo + ((hi - lo) / 4) * k);
    return out;
  }, [lo, hi]);

  const xTicks = useMemo(() => {
    const out: { i: number; text: string }[] = [];
    const want = narrow ? 4 : 7;
    const step = Math.max(1, Math.round((n - baseIdx) / want));
    for (let i = baseIdx; i < n; i += step) {
      const m = months[i];
      if (m) out.push({ i, text: m.slice(0, 4) });
    }
    return out;
  }, [n, baseIdx, months, narrow]);

  const eventIdx = useMemo(
    () =>
      events
        .map((e) => ({ i: months.indexOf(e.month), label: e.label }))
        .filter((e) => e.i >= baseIdx),
    [events, months, baseIdx]
  );

  const nearest = useCallback(
    (clientX: number): number | null => {
      const svg = wrapRef.current?.querySelector('.ge-svg');
      if (!svg) return null;
      const r = svg.getBoundingClientRect();
      const px = clientX - r.left - PAD.left;
      const i = Math.round((px / innerW) * (n - 1));
      return Math.max(baseIdx, Math.min(n - 1, i));
    },
    [innerW, n, baseIdx]
  );

  useEffect(() => {
    if (!pinned) return;
    let armed = false;
    const t = setTimeout(() => (armed = true), 80);
    const off = () => {
      if (!armed) return;
      setPinned(false);
      setHover(null);
    };
    document.addEventListener('pointerdown', off, true);
    return () => {
      clearTimeout(t);
      document.removeEventListener('pointerdown', off, true);
    };
  }, [pinned]);

  const readoutLeft = hover != null ? PAD.left + x(hover) : 0;
  const flip = readoutLeft > w * 0.62;

  return (
    <div className="ge" ref={wrapRef}>
      <div className="ge-controls">
        <label className="ge-slider-label" htmlFor={sliderId}>
          Compare growth since
          <strong> {longLabel(baseMonth)}</strong>
        </label>
        {/* The control's value is the base month's index on the axis, not the
            months-back count. Storing "back" but emitting an inverted value
            put `value` and `onChange` in different coordinate systems, so the
            thumb fought the state and neither keyboard nor drag moved it. The
            slider now reads left→right as earlier→later, which is the
            direction the chart's own axis runs. */}
        <input
          id={sliderId}
          className="ge-slider"
          type="range"
          min={Math.max(0, n - 1 - maxB)}
          max={Math.max(0, n - 1 - minBack)}
          step={1}
          value={baseIdx}
          onChange={(e) => setBack(n - 1 - Number(e.currentTarget.value))}
          aria-label="Base month for the growth comparison"
          aria-valuetext={longLabel(baseMonth)}
        />
        <div className="ge-slider-ends small faint">
          <span>{label(months[Math.max(0, n - 1 - maxB)] ?? '')}</span>
          <span>{label(months[Math.max(0, n - 1 - minBack)] ?? '')}</span>
        </div>
      </div>

      {hasSub && (
        <div className="ge-tabs" role="tablist" aria-label="Growth comparison">
          <button
            role="tab"
            aria-selected={tab === 'area'}
            className={tab === 'area' ? 'is-on' : ''}
            onClick={() => setTab('area')}
          >
            This area in context
          </button>
          <button
            role="tab"
            aria-selected={tab === 'subareas'}
            className={tab === 'subareas' ? 'is-on' : ''}
            onClick={() => setTab('subareas')}
          >
            Its {subareas.length} subareas
          </button>
        </div>
      )}

      <div className="legend">
        {drawn.map((s, k) => (
          <span key={s.name}>
            <i style={{ background: `var(${CATS[k % CATS.length]})` }} />
            {s.name}
          </span>
        ))}
      </div>

      <svg
        className="ge-svg"
        width="100%"
        height={height}
        viewBox={`0 0 ${w} ${height}`}
        role="img"
        aria-label={`Growth of ${drawn.length} areas since ${longLabel(baseMonth)}, where 100% is that month`}
        tabIndex={0}
        onPointerMove={(e) => {
          if (pinned && e.pointerType === 'touch') return;
          setHover(nearest(e.clientX));
        }}
        onPointerLeave={(e) => {
          if (e.pointerType === 'touch') return;
          setHover(null);
        }}
        onPointerDown={(e) => {
          if (e.pointerType !== 'touch') return;
          setHover(nearest(e.clientX));
          setPinned(true);
        }}
        onFocus={() => setHover((h) => h ?? n - 1)}
        onBlur={() => setHover(null)}
        onKeyDown={(e) => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
          e.preventDefault();
          setHover((h) => {
            const cur = h ?? n - 1;
            if (e.key === 'Home') return baseIdx;
            if (e.key === 'End') return n - 1;
            const next = cur + (e.key === 'ArrowRight' ? 1 : -1);
            return Math.max(baseIdx, Math.min(n - 1, next));
          });
        }}
      >
        <g transform={`translate(${PAD.left},${PAD.top})`}>
          {yTicks.map((v, k) => (
            <g key={k} transform={`translate(0,${y(v).toFixed(2)})`}>
              <line className="ge-grid" x1={0} x2={innerW} />
              <text className="ge-axis" x={-8} y={3} textAnchor="end">
                {(v * 100).toFixed(0)}%
              </text>
            </g>
          ))}

          {/* The base month reads exactly 100% by construction — mark it. */}
          <line
            className="ge-base"
            x1={x(baseIdx).toFixed(2)}
            x2={x(baseIdx).toFixed(2)}
            y1={0}
            y2={innerH}
          />
          <line className="ge-base" x1={0} x2={innerW} y1={y(1).toFixed(2)} y2={y(1).toFixed(2)} />

          {eventIdx.map((e, k) => (
            <g key={`ev${k}`} transform={`translate(${x(e.i).toFixed(2)},0)`}>
              <line className="ge-event" y1={0} y2={innerH} />
              <text className="ge-event-label" y={10} x={3}>{e.label}</text>
            </g>
          ))}

          {paths.map((d, k) => (
            <path key={k} className="ge-line" d={d} style={{ stroke: `var(${CATS[k % CATS.length]})` }} />
          ))}

          {hover != null && (
            <g className="ge-cursor" transform={`translate(${x(hover).toFixed(2)},0)`}>
              <line y1={0} y2={innerH} />
              {drawn.map((s, k) =>
                s.vals[hover] == null ? null : (
                  <circle
                    key={k}
                    cy={y(s.vals[hover]!)}
                    r={3}
                    style={{ fill: `var(${CATS[k % CATS.length]})` }}
                  />
                )
              )}
            </g>
          )}

          {xTicks.map((t) => (
            <text
              key={t.i}
              className="ge-axis"
              x={x(t.i).toFixed(2)}
              y={innerH + 17}
              textAnchor="middle"
            >
              {t.text}
            </text>
          ))}
        </g>
      </svg>

      {hover != null && months[hover] && (
        <div
          className={`ge-readout${narrow ? ' is-pinned' : ''}${flip ? ' is-flipped' : ''}`}
          style={narrow ? undefined : { left: `${readoutLeft}px` }}
          role="status"
        >
          <div className="ge-readout-month">{longLabel(months[hover]!)}</div>
          {drawn
            .map((s, k) => ({ s, k, v: s.vals[hover] }))
            .filter((r) => r.v != null)
            .sort((a, b) => (b.v ?? 0) - (a.v ?? 0))
            .slice(0, 8)
            .map(({ s, k, v }) => (
              <div className="ge-readout-row" key={s.name}>
                <i style={{ background: `var(${CATS[k % CATS.length]})` }} />
                <span>{s.name}</span>
                <b className="num">{((v ?? 0) * 100).toFixed(1)}%</b>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
