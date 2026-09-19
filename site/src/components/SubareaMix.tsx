/** How an area's total splits across its subareas, over time.
 *
 * Two readings of the same series, toggled: absolute (how it grew) and 100%
 * stacked (how the composition shifted). The composition view is the one that
 * answers "who gained share", which absolute totals hide when everything grows.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { timeTicks } from '../lib/ticks';
import { fmt } from '../lib/format';
import { t, type Lang } from '../lib/i18n';
import './SubareaMix.css';

export interface SeriesIn {
  name: string;
  slug: string | null;
  cum: number[];
}

export interface Props {
  lang: Lang;
  months: string[];
  subareas: SeriesIn[];
  height?: number;
  /** Series beyond this are pooled into "Other", newest-largest first. */
  maxSeries?: number;
}

const PAD = { top: 12, right: 14, bottom: 26, left: 50 };
const CATS = ['--m-cat-1','--m-cat-2','--m-cat-3','--m-cat-4','--m-cat-5','--m-cat-6','--m-cat-7','--m-cat-8'];
export default function SubareaMix({
  lang,
  months,
  subareas,
  height = 320,
  maxSeries = 8,
}: Props) {
  const f = fmt(lang);
  const longLabel = f.monthLabel;
  const [pct, setPct] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const [pinned, setPinned] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [w, setW] = useState(760);
  const toggleId = useId();
  const n = months.length;

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
  const innerH = Math.max(90, height - PAD.top - PAD.bottom);

  /** Largest at the final month keep their identity; the tail becomes "Other",
   * because more than about eight parts stops being readable as a whole. */
  const series = useMemo(() => {
    const last = n - 1;
    const ranked = [...subareas].sort(
      (a, b) => (b.cum[last] ?? 0) - (a.cum[last] ?? 0)
    );
    if (ranked.length <= maxSeries) return ranked;
    const keep = ranked.slice(0, maxSeries - 1);
    const rest = ranked.slice(maxSeries - 1);
    const other = months.map((_, i) =>
      rest.reduce((s, r) => s + (r.cum[i] ?? 0), 0)
    );
    return [
      ...keep,
      { name: t(lang, 'mix.other', { n: String(rest.length) }), slug: null, cum: other },
    ];
  }, [subareas, n, maxSeries, months, lang]);

  /** Cumulative stack bands per month. */
  const bands = useMemo(() => {
    const tops: number[][] = series.map(() => []);
    const totals: number[] = [];
    for (let i = 0; i < n; i++) {
      let acc = 0;
      let total = 0;
      for (const s of series) total += s.cum[i] ?? 0;
      totals.push(total);
      series.forEach((s, k) => {
        acc += s.cum[i] ?? 0;
        const v = pct ? (total ? acc / total : 0) : acc;
        tops[k]![i] = v;
      });
    }
    return { tops, totals };
  }, [series, n, pct]);

  const yMax = useMemo(() => {
    if (pct) return 1;
    let mx = 0;
    for (const v of bands.tops[bands.tops.length - 1] ?? []) if (v > mx) mx = v;
    return mx || 1;
  }, [bands, pct]);

  const x = useCallback((i: number) => (n <= 1 ? 0 : (i / (n - 1)) * innerW), [n, innerW]);
  const y = useCallback((v: number) => innerH - (v / yMax) * innerH, [innerH, yMax]);

  const areas = useMemo(
    () =>
      bands.tops.map((top, k) => {
        const below = k === 0 ? null : bands.tops[k - 1]!;
        let d = '';
        for (let i = 0; i < n; i++) d += `${i ? 'L' : 'M'}${x(i).toFixed(2)},${y(top[i] ?? 0).toFixed(2)}`;
        for (let i = n - 1; i >= 0; i--)
          d += `L${x(i).toFixed(2)},${y(below ? below[i] ?? 0 : 0).toFixed(2)}`;
        return d + 'Z';
      }),
    [bands, n, x, y]
  );

  const nearest = useCallback(
    (clientX: number): number | null => {
      const svg = wrapRef.current?.querySelector('.sm-svg');
      if (!svg) return null;
      const r = svg.getBoundingClientRect();
      const i = Math.round(((clientX - r.left - PAD.left) / innerW) * (n - 1));
      return Math.max(0, Math.min(n - 1, i));
    },
    [innerW, n]
  );

  useEffect(() => {
    if (!pinned) return;
    let armed = false;
    const t = setTimeout(() => (armed = true), 80);
    const off = () => { if (armed) { setPinned(false); setHover(null); } };
    document.addEventListener('pointerdown', off, true);
    return () => { clearTimeout(t); document.removeEventListener('pointerdown', off, true); };
  }, [pinned]);

  const xTicks = useMemo(
    () => timeTicks(lang, months, 0, n - 1, narrow ? 4 : 8),
    [months, n, narrow]
  );

  const readoutLeft = hover != null ? PAD.left + x(hover) : 0;
  const flip = readoutLeft > w * 0.62;

  return (
    <div className="sm" ref={wrapRef}>
      <div className="sm-controls">
        <label className="sm-toggle" htmlFor={toggleId}>
          <input
            id={toggleId}
            type="checkbox"
            checked={pct}
            onChange={(e) => setPct(e.currentTarget.checked)}
          />
          <span>{t(lang, 'mix.share_toggle')}</span>
        </label>
      </div>

      <div className="legend">
        {series.map((s, k) => (
          <span key={s.name}>
            <i style={{ background: `var(${CATS[k % CATS.length]})` }} />
            {s.name}
          </span>
        ))}
      </div>

      <svg
        className="sm-svg"
        width="100%"
        height={height}
        viewBox={`0 0 ${w} ${height}`}
        role="img"
        aria-label={t(lang, 'mix.aria', {
          mode: pct ? t(lang, 'mix.mode_share') : t(lang, 'mix.mode_absolute'),
        })}
        tabIndex={0}
        onPointerMove={(e) => { if (!(pinned && e.pointerType === 'touch')) setHover(nearest(e.clientX)); }}
        onPointerLeave={(e) => { if (e.pointerType !== 'touch') setHover(null); }}
        onPointerDown={(e) => { if (e.pointerType === 'touch') { setHover(nearest(e.clientX)); setPinned(true); } }}
        onFocus={() => setHover((h) => h ?? n - 1)}
        onBlur={() => setHover(null)}
        onKeyDown={(e) => {
          if (!['ArrowLeft','ArrowRight','Home','End'].includes(e.key)) return;
          e.preventDefault();
          setHover((h) => {
            const cur = h ?? n - 1;
            if (e.key === 'Home') return 0;
            if (e.key === 'End') return n - 1;
            return Math.max(0, Math.min(n - 1, cur + (e.key === 'ArrowRight' ? 1 : -1)));
          });
        }}
      >
        <g transform={`translate(${PAD.left},${PAD.top})`}>
          {[0, 0.25, 0.5, 0.75, 1].map((fr) => {
            const v = yMax * fr;
            return (
              <g key={fr} transform={`translate(0,${y(v).toFixed(2)})`}>
                <line className="sm-grid" x1={0} x2={innerW} />
                <text className="sm-axis" x={-8} y={3} textAnchor="end">
                  {pct
                    ? `${Math.round(fr * 100)}%`
                    : v >= 1000
                      ? `${Math.round(v / 1000)}k`
                      : f.num0(v)}
                </text>
              </g>
            );
          })}

          {areas.map((d, k) => (
            <path key={k} className="sm-area" d={d} style={{ fill: `var(${CATS[k % CATS.length]})` }} />
          ))}

          {hover != null && (
            <line className="sm-cursor" x1={x(hover)} x2={x(hover)} y1={0} y2={innerH} />
          )}

          {xTicks.map((t) => (
            <text key={t.i} className="sm-axis" x={x(t.i).toFixed(2)} y={innerH + 17} textAnchor="middle">
              {t.text}
            </text>
          ))}
        </g>
      </svg>

      {hover != null && months[hover] && (
        <div
          className={`sm-readout${narrow ? ' is-pinned' : ''}${flip ? ' is-flipped' : ''}`}
          style={narrow ? undefined : { left: `${readoutLeft}px` }}
          role="status"
        >
          <div className="sm-readout-month">{longLabel(months[hover]!)}</div>
          {series
            .map((s, k) => ({ s, k, v: s.cum[hover] ?? 0 }))
            .sort((a, b) => b.v - a.v)
            .slice(0, 8)
            .map(({ s, k, v }) => (
              <div className="sm-readout-row" key={s.name}>
                <i style={{ background: `var(${CATS[k % CATS.length]})` }} />
                <span>{s.name}</span>
                <b className="num">
                  {pct
                    ? f.pct1((bands.totals[hover] ?? 0) ? v / (bands.totals[hover] ?? 1) : 0)
                    : f.num0(v)}
                </b>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
