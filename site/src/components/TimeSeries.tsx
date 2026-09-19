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
import { timeTicks } from '../lib/ticks';
/* Both dictionaries ship to the browser rather than the strings being threaded
 * in as props. The whole dictionary is a few kilobytes beside the geometry and
 * MapLibre, and an island that translates itself cannot be handed the wrong
 * language by a caller that forgot a prop. */
import { fmt } from '../lib/format';
import { t, type Lang } from '../lib/i18n';
import './TimeSeries.css';

export interface EventMark {
  month: string;
  label: string;
  /** Shown when the mark is hovered or tapped. The same words as the key under
   * the chart; the key is the accessible, always-reachable copy and this is
   * the convenient one. */
  description?: string | null;
}

export interface Props {
  lang: Lang;
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

  /* ---- the downward series -------------------------------------------- */
  /** Drawn below the zero line, on the same scale as `bars`. Registrations
   * arriving and licences leaving are the two directions of one flow, and
   * showing them as two charts made the reader hold one in their head while
   * looking at the other. Sharing a scale is the whole point: two scales, one
   * up and one down, would make a small outflow look like a large one. */
  negBars?: (number | null)[];
  negBarLabel?: string;
  /** Index before which the downward series is not merely zero but unknown —
   * a lapsed licence is only visible between two pulls of the register, so
   * before the second pull there is nothing to see. */
  negStartIndex?: number;
  negUnobserved?: number[];
}

/** Horizontal room a policy mark needs before the next one has to drop a
 * row, and how far it drops. The marker is 14px across. */
const MARK_GAP = 17;
const MARK_STEP = 16;

const PAD = { top: 14, right: 54, bottom: 26, left: 52 };

/** Axis-sized number: 9000 -> "9k". Bars run to four figures and the axis has
 * 54px to say so. */
const kilo = (v: number): string =>
  v >= 1000 ? `${Math.round(v / 100) / 10}k` : String(Math.round(v));

export default function TimeSeries({
  lang,
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
  negBars,
  negBarLabel,
  negStartIndex = 0,
  negUnobserved = [],
}: Props) {
  const f = fmt(lang);
  const label = f.monthShort;
  const fmtInt = (v: number | null) => f.num0(v);
  const fmtPct = (v: number | null) => f.pct1(v);

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [w, setW] = useState(760);
  const [hover, setHover] = useState<number | null>(null);
  const [pinned, setPinned] = useState(false);
  /** Which policy mark the pointer is on, if any. While a mark is hovered its
   * description replaces the month readout rather than joining it: two boxes
   * competing for the same corner is how a chart stops being readable. */
  const [hoverEvent, setHoverEvent] = useState<number | null>(null);
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

  // The downward series carries its own unobserved set and its own start,
  // because the two directions became measurable at different times: arrivals
  // are dated by the register itself and run to 2012, departures only exist
  // from the second pull onward.
  const negUnobs = useMemo(() => new Set(negUnobserved), [negUnobserved]);
  const negBars2 = useMemo(() => {
    if (!negBars) return null;
    return negBars
      .slice(s0)
      .map((v, i) =>
        negUnobs.has(i + s0) || i + s0 < negStartIndex ? null : v
      );
  }, [negBars, s0, negUnobs, negStartIndex]);
  /** Where the downward series starts being knowable, on the sliced axis. */
  const negFrom = Math.max(0, negStartIndex - s0);

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

  const { lineMax, barMaxPos, barMaxNeg } = useMemo(() => {
    let lm = 0;
    let up = 0;
    let down = 0;
    for (const v of line2) if (v != null && v > lm) lm = v;
    for (const v of bars2) if (v != null && v > up) up = v;
    for (const v of negBars2 ?? []) if (v != null && Math.abs(v) > down) down = Math.abs(v);
    return { lineMax: lm || 1, barMaxPos: up || 1, barMaxNeg: down };
  }, [line2, bars2, negBars2]);

  const n = months2.length;
  const x = useCallback(
    (i: number) => (n <= 1 ? 0 : (i / (n - 1)) * innerW),
    [n, innerW]
  );

  /* One figure, two stacked panels sharing an axis — the stock above, the flow
   * below. Overlaying them was the obvious thing and it did not work: the
   * running total climbs to six figures across the full height while the
   * monthly flow is four figures, so the line swept straight through the bars,
   * and one catch-up month of losses pushed the flow's zero line a third of
   * the way down the plot. Two panels, one x-axis, one crosshair and one set
   * of policy rules spanning both: still one chart to read, but each series
   * gets a vertical scale it can use.
   *
   * Within the flow panel the two directions share a scale. Fitting each to
   * its own half would draw a month that lost 400 licences the same size as a
   * month that gained 9,000, which is the one thing a two-directional chart
   * must not do. */
  const hasFlow = negBars2 != null && barMaxNeg > 0;
  const GAP = 14;
  // Just over half to the stock, just under to the flow. The flow panel needs
  // the bigger share of what is left because it carries two directions and,
  // once a catch-up month is in it, a two-to-one spread between them.
  const lineH = hasFlow ? Math.round((innerH - GAP) * 0.55) : innerH;
  const flowTop = hasFlow ? lineH + GAP : 0;
  const flowH = hasFlow ? innerH - flowTop : innerH;
  const barScale = hasFlow
    ? flowH / (barMaxPos + barMaxNeg)
    : (innerH * 0.92) / barMaxPos;
  // Zero sits below the positive band, not below the negative one. Getting
  // this the wrong way round reserved the *outflow's* height above the line
  // and pushed the downward bars straight out of the viewBox.
  const baseY = hasFlow ? flowTop + barMaxPos * barScale : innerH;

  const yLine = useCallback(
    (v: number) => lineH - (v / lineMax) * lineH,
    [lineH, lineMax]
  );
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

  const ticks = useMemo(
    () => timeTicks(lang, months2, 0, n - 1, narrow ? 4 : 8),
    [months2, n, narrow]
  );

  const yTicks = useMemo(() => {
    const out: number[] = [];
    for (let k = 0; k <= 4; k++) out.push((lineMax / 4) * k);
    return out;
  }, [lineMax]);

  /* Marks that would overlap are stacked downward instead of drawn on top of
   * each other. Four of the six changes to the law fall inside fourteen months
   * of each other, which on a 360px axis spanning fourteen years puts them 4 to
   * 13 pixels apart — the markers are 14 wide, so without this the numbers are
   * illegible exactly where the interesting legislation is. */
  const eventIdx = useMemo(() => {
    const hits = events
      .map((e, k) => ({
        i: months2.indexOf(e.month),
        label: e.label,
        description: e.description ?? null,
        n: k + 1,
        row: 0,
      }))
      .filter((e) => e.i >= 0)
      .sort((a, b) => a.i - b.i);
    let lastX = -Infinity;
    let row = 0;
    for (const h of hits) {
      const px = x(h.i);
      row = px - lastX < MARK_GAP ? row + 1 : 0;
      h.row = row;
      lastX = px;
    }
    return hits;
  }, [events, months2, x]);

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
  const eventLeft =
    hoverEvent != null && eventIdx[hoverEvent]
      ? PAD.left + x(eventIdx[hoverEvent]!.i)
      : 0;

  return (
    <div className="ts-wrap" ref={wrapRef}>
      <svg
        className="ts-svg"
        width="100%"
        height={height}
        viewBox={`0 0 ${w} ${height}`}
        role="img"
        aria-label={`${t(lang, 'ts.aria', { line: lineLabel, bars: barLabel })}, ${label(
          months2[0] ?? ''
        )} – ${label(months2[n - 1] ?? '')}`}
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

          {/* Left axis for the flow panel: its own two ends, so the bars are
              drawn to a scale the chart actually names. Before the panels were
              split the bars had no axis at all. */}
          {hasFlow && (
            <g className="ts-axis-flow">
              <text className="ts-axis" x={-8} y={flowTop + 8} textAnchor="end">
                {'+' + kilo(barMaxPos)}
              </text>
              <text className="ts-axis" x={-8} y={innerH} textAnchor="end">
                {'−' + kilo(barMaxNeg)}
              </text>
            </g>
          )}

          {/* A numbered flag, not a label. Rotated 9.5px text inside the plot
              was illegible and overlapped the data it annotated; the number is
              readable at this size and the wording lives in <EventKey> under
              the chart, where it can be a sentence. `n` is the mark's position
              in the full event list, so it means the same thing on every chart
              on the page. The <title> gives a native tooltip and an accessible
              name without making the text hover-only — the key below is always
              visible. */}
          {eventIdx.map((e, k) => (
            <g
              key={`ev${e.n}`}
              className={`ts-event-g${hoverEvent === k ? ' is-on' : ''}`}
              transform={`translate(${x(e.i).toFixed(2)},0)`}
              onPointerEnter={() => setHoverEvent(k)}
              onPointerLeave={() => setHoverEvent(null)}
            >
              <title>{`${e.n}. ${e.label}`}</title>
              <line className="ts-event" y1={0} y2={innerH} />
              {/* A bigger invisible target than the 14px disc. Fourteen pixels
                  is under the 24px minimum for a pointer target, and these sit
                  close together where the interesting legislation is. */}
              {/* The handlers are on the group, but only the discs are
                  hit-testable — the dashed rule spans the full height of the
                  plot, and a reader scrubbing along the months would otherwise
                  trip the description every time the pointer crossed one.
                  This disc is the target; the painted one on top of it is
                  smaller than any pointer target should be. */}
              <circle className="ts-event-hit" cy={7 + e.row * MARK_STEP} r={13} />
              <circle className="ts-event-dot" cy={7 + e.row * MARK_STEP} r={7} />
              <text
                className="ts-event-n"
                y={10.5 + e.row * MARK_STEP}
                textAnchor="middle"
              >
                {e.n}
              </text>
            </g>
          ))}

          {/* Where the downward series cannot be known yet, say so once rather
              than leaving an empty half the reader has to interpret. An empty
              region below the axis reads as "nothing left the register", which
              is a claim; this is an absence of measurement. */}
          {hasFlow && negFrom > 0 && (
            <g className="ts-nodata">
              <rect
                x={0}
                y={flowTop}
                width={x(negFrom).toFixed(2)}
                height={(innerH - flowTop).toFixed(2)}
              />
              {x(negFrom) > 130 && (
                <text x={6} y={(baseY + 13).toFixed(2)}>
                  {t(lang, 'ts.not_observable')}
                </text>
              )}
            </g>
          )}

          {bars2.map((v, i) =>
            v == null || v === 0 ? null : (
              <rect
                key={i}
                className="ts-bar"
                x={(x(i) - barW / 2).toFixed(2)}
                width={barW.toFixed(2)}
                y={(baseY - v * barScale).toFixed(2)}
                height={(v * barScale).toFixed(2)}
              />
            )
          )}

          {negBars2?.map((v, i) =>
            v == null || v === 0 ? null : (
              <rect
                key={`n${i}`}
                className="ts-bar-neg"
                x={(x(i) - barW / 2).toFixed(2)}
                width={barW.toFixed(2)}
                y={baseY.toFixed(2)}
                height={(Math.abs(v) * barScale).toFixed(2)}
              />
            )
          )}

          {hasFlow && (
            <>
              <line className="ts-zero" x1={0} x2={innerW} y1={baseY} y2={baseY} />
              <text className="ts-axis" x={-8} y={baseY + 3} textAnchor="end">
                0
              </text>
            </>
          )}

          <path className="ts-line" d={linePath} />

          {hover != null && (
            <g className="ts-cursor" transform={`translate(${x(hover).toFixed(2)},0)`}>
              <line y1={0} y2={innerH} />
              {/* One crosshair across both panels: the flow at a month and the
                  stock at that month are the same reading. */}
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

      {hoverEvent != null && eventIdx[hoverEvent] && (
        <div
          className={`ts-readout is-event${narrow ? ' is-pinned' : ''}${
            eventLeft > w * 0.62 ? ' is-flipped' : ''
          }`}
          style={narrow ? undefined : { left: `${eventLeft}px` }}
          role="status"
        >
          <div className="ts-readout-month">
            <span className="ts-readout-n">{eventIdx[hoverEvent]!.n}</span>
            {eventIdx[hoverEvent]!.label}
          </div>
          {eventIdx[hoverEvent]!.description && (
            <p className="ts-readout-desc">{eventIdx[hoverEvent]!.description}</p>
          )}
        </div>
      )}

      {hv && hoverEvent == null && (
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
          {negBars2 && negBarLabel && (
            <div className="ts-readout-row">
              <i className="swatch-bar-neg" />
              <span>{negBarLabel}</span>
              <b className="num">
                {hover! < negFrom
                  ? t(lang, 'ts.not_observed_short')
                  : fmtInt(negBars2[hover!] ?? null)}
              </b>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
