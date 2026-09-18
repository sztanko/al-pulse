/** Dual-axis monthly timeline: a cumulative line and a per-month bar series,
 * with policy events annotated on the time axis.
 *
 * Interaction rules this implements, all of which have bitten the reference
 * project:
 *  - pointer events, not mouse events, so it is not inert on touch;
 *  - touch gets its own dismissal rule, because a touch pointer fires
 *    pointerleave the instant the finger lifts;
 *  - the readout goes to the pointer, except on a narrow screen where it pins
 *    to an edge — there is no room to place a box beside a mark without it
 *    running off one side;
 *  - it answers wherever the pointer is, snapping to the nearest month;
 *  - arrow keys step through the series, and focus reveals what hover reveals.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './TimeSeries.css';

export interface EventMark {
  month: string;
  label: string;
}

export interface Props {
  months: string[];
  line: (number | null)[];
  bars: (number | null)[];
  lineLabel: string;
  barLabel: string;
  events?: EventMark[];
  /** Formatting is passed as a name rather than a function: an island's props
   * are serialised into the HTML, and a function cannot cross that boundary. */
  lineFormat?: 'int' | 'pct';
  height?: number;
  /** Clip the axis to start here — used where a series only becomes meaningful
   * partway along, rather than drawing a flat zero over the part we cannot
   * speak to. */
  startIndex?: number;
  /** Month indices the register was not pulled in. Their values are not zero,
   * they are unknown, and the chart says so rather than implying a number. */
  unobserved?: number[];
}

const PAD = { top: 14, right: 54, bottom: 26, left: 52 };

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function label(m: string): string {
  const [y, mm] = m.split('-');
  return `${MONTHS[Number(mm) - 1] ?? mm} ${y}`;
}

const fmtInt = (v: number | null): string =>
  v == null ? '—' : Math.round(v).toLocaleString('en-GB');

const fmtPct = (v: number | null): string =>
  v == null ? '—' : (v * 100).toFixed(1) + '%';

export default function TimeSeries({
  months,
  line,
  bars,
  lineLabel,
  barLabel,
  events = [],
  lineFormat = 'int',
  height = 300,
  startIndex = 0,
  unobserved = [],
}: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [w, setW] = useState(760);
  const [hover, setHover] = useState<number | null>(null);
  const [pinned, setPinned] = useState(false);
  const fmtLine = lineFormat === 'pct' ? fmtPct : fmtInt;

  // "Not observed" is not "zero". Where no pull brackets a month, the value is
  // unknown: drop it rather than draw a number the data cannot support.
  const unobs = useMemo(() => new Set(unobserved), [unobserved]);
  const s0 = Math.max(0, Math.min(startIndex, months.length - 1));
  const months2 = useMemo(() => months.slice(s0), [months, s0]);
  const line2 = useMemo(
    () => line.slice(s0).map((v, i) => (unobs.has(i + s0) ? null : v)),
    [line, s0, unobs]
  );
  const bars2 = useMemo(
    () => bars.slice(s0).map((v, i) => (unobs.has(i + s0) ? null : v)),
    [bars, s0, unobs]
  );

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth || 760));
    ro.observe(el);
    setW(el.clientWidth || 760);
    return () => ro.disconnect();
  }, []);

  const narrow = w < 560;
  const innerW = Math.max(120, w - PAD.left - PAD.right);
  const innerH = Math.max(80, height - PAD.top - PAD.bottom);

  const { lineMax, barMax } = useMemo(() => {
    let lm = 0;
    let bm = 0;
    for (const v of line2) if (v != null && v > lm) lm = v;
    for (const v of bars2) if (v != null && v > bm) bm = v;
    return { lineMax: lm || 1, barMax: bm || 1 };
  }, [line2, bars2]);

  const n = months2.length;
  const x = useCallback(
    (i: number) => (n <= 1 ? 0 : (i / (n - 1)) * innerW),
    [n, innerW]
  );
  const yLine = useCallback((v: number) => innerH - (v / lineMax) * innerH, [innerH, lineMax]);
  const barW = Math.max(1, innerW / Math.max(n, 1) - 0.6);

  const linePath = useMemo(() => {
    let d = '';
    let started = false;
    line2.forEach((v, i) => {
      if (v == null) return;
      d += `${started ? 'L' : 'M'}${x(i).toFixed(2)},${yLine(v).toFixed(2)}`;
      started = true;
    });
    return d;
  }, [line2, x, yLine]);

  const ticks = useMemo(() => {
    const out: { i: number; text: string }[] = [];
    const want = narrow ? 4 : 7;
    const step = Math.max(1, Math.round(n / want));
    for (let i = 0; i < n; i += step) {
      const m = months2[i];
      if (m) out.push({ i, text: m.slice(0, 4) });
    }
    return out;
  }, [n, months2, narrow]);

  const yTicks = useMemo(() => {
    const out: number[] = [];
    for (let k = 0; k <= 4; k++) out.push((lineMax / 4) * k);
    return out;
  }, [lineMax]);

  const eventIdx = useMemo(
    () =>
      events
        .map((e) => ({ i: months2.indexOf(e.month), label: e.label }))
        .filter((e) => e.i >= 0),
    [events, months2]
  );

  const nearest = useCallback(
    (clientX: number): number | null => {
      const el = wrapRef.current?.querySelector('svg');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const px = clientX - r.left - PAD.left;
      if (n <= 1) return 0;
      const i = Math.round((px / innerW) * (n - 1));
      return Math.max(0, Math.min(n - 1, i));
    },
    [innerW, n]
  );

  const onMove = (e: React.PointerEvent) => {
    if (pinned && e.pointerType === 'touch') return;
    setHover(nearest(e.clientX));
  };

  const onLeave = (e: React.PointerEvent) => {
    // A touch pointer fires pointerleave the instant the finger lifts, so a tap
    // would open and close the readout in one gesture.
    if (e.pointerType === 'touch') return;
    setHover(null);
  };

  const onDown = (e: React.PointerEvent) => {
    if (e.pointerType !== 'touch') return;
    setHover(nearest(e.clientX));
    setPinned(true);
  };

  // Dismiss a pinned (touch) readout on the next tap anywhere. Armed on a short
  // delay so the opening tap is not also the closing one, and in the capture
  // phase so moving between marks closes and reopens in the right order.
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

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End')
      return;
    e.preventDefault();
    setHover((h) => {
      const cur = h ?? n - 1;
      if (e.key === 'Home') return 0;
      if (e.key === 'End') return n - 1;
      const next = cur + (e.key === 'ArrowRight' ? 1 : -1);
      return Math.max(0, Math.min(n - 1, next));
    });
  };

  const hv = hover != null ? months2[hover] : null;
  const readoutLeft = hover != null ? PAD.left + x(hover) : 0;
  const flip = readoutLeft > w * 0.62;

  return (
    <div className="ts-wrap" ref={wrapRef}>
      <svg
        className="ts-svg"
        width="100%"
        height={height}
        viewBox={`0 0 ${w} ${height}`}
        role="img"
        aria-label={`${lineLabel} and ${barLabel} by month, ${label(months2[0] ?? '')} to ${label(
          months2[n - 1] ?? ''
        )}`}
        tabIndex={0}
        onPointerMove={onMove}
        onPointerLeave={onLeave}
        onPointerDown={onDown}
        onKeyDown={onKey}
        onFocus={() => setHover((h) => h ?? n - 1)}
        onBlur={() => setHover(null)}
      >
        <g transform={`translate(${PAD.left},${PAD.top})`}>
          {yTicks.map((v, k) => (
            <g key={k} transform={`translate(0,${yLine(v).toFixed(2)})`}>
              <line className="ts-grid" x1={0} x2={innerW} y1={0} y2={0} />
              <text className="ts-axis" x={-8} y={3} textAnchor="end">
                {v >= 1000 ? Math.round(v / 1000) + 'k' : Math.round(v)}
              </text>
            </g>
          ))}

          {eventIdx.map((e, k) => (
            <g key={`ev${k}`} transform={`translate(${x(e.i).toFixed(2)},0)`}>
              <line className="ts-event" y1={0} y2={innerH} />
              <text className="ts-event-label" y={10} x={3}>
                {e.label}
              </text>
            </g>
          ))}

          {bars2.map((v, i) =>
            v == null || v === 0 ? null : (
              <rect
                key={i}
                className="ts-bar"
                x={(x(i) - barW / 2).toFixed(2)}
                width={barW.toFixed(2)}
                y={(innerH - (v / barMax) * innerH * 0.92).toFixed(2)}
                height={((v / barMax) * innerH * 0.92).toFixed(2)}
              />
            )
          )}

          <path className="ts-line" d={linePath} />

          {hover != null && (
            <g className="ts-cursor" transform={`translate(${x(hover).toFixed(2)},0)`}>
              <line y1={0} y2={innerH} />
              {line2[hover] != null && <circle cy={yLine(line2[hover]!)} r={3.5} />}
            </g>
          )}

          {ticks.map((t) => (
            <text
              key={t.i}
              className="ts-axis"
              x={x(t.i).toFixed(2)}
              y={innerH + 17}
              textAnchor="middle"
            >
              {t.text}
            </text>
          ))}
        </g>
      </svg>

      {hv && (
        <div
          className={`ts-readout${narrow ? ' is-pinned' : ''}${flip ? ' is-flipped' : ''}`}
          style={narrow ? undefined : { left: `${readoutLeft}px` }}
          role="status"
        >
          <div className="ts-readout-month">{label(hv)}</div>
          <div className="ts-readout-row">
            <i className="swatch-line" />
            <span>{lineLabel}</span>
            <b className="num">{fmtLine(line2[hover!] ?? null)}</b>
          </div>
          <div className="ts-readout-row">
            <i className="swatch-bar" />
            <span>{barLabel}</span>
            <b className="num">{fmtInt(bars2[hover!] ?? null)}</b>
          </div>
        </div>
      )}
    </div>
  );
}
