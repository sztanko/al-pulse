/** Time-axis ticks that say what they are actually resolving.
 *
 * Labelling every tick with a year is fine over fourteen years and useless over
 * two: the reader sees six bars all marked "2025" and cannot tell which month
 * any of them is. The granularity has to follow the span.
 *
 *   > ~6 years   one tick per year, thinned
 *   > ~15 months one tick per quarter, "Jan 2025"
 *   otherwise    one tick per month or two, "Jan", with the year on the first
 *                tick and on each January
 */

const SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export interface Tick {
  i: number;
  text: string;
}

export function timeTicks(
  months: string[],
  from: number,
  to: number,
  want = 8
): Tick[] {
  const lo = Math.max(0, from);
  const hi = Math.min(months.length - 1, to);
  const span = hi - lo + 1;
  if (span <= 0) return [];

  const out: Tick[] = [];

  // Long span: years only.
  if (span > 72) {
    const seen = new Set<string>();
    const years: Tick[] = [];
    for (let i = lo; i <= hi; i++) {
      const y = months[i]?.slice(0, 4);
      if (!y || seen.has(y)) continue;
      seen.add(y);
      years.push({ i, text: y });
    }
    if (years.length <= want) return years;
    const every = Math.ceil(years.length / want);
    return years.filter((_, k) => k % every === 0);
  }

  // Medium span: quarters, each carrying its year.
  if (span > 15) {
    for (let i = lo; i <= hi; i++) {
      const m = months[i];
      if (!m) continue;
      const mm = Number(m.slice(5, 7));
      if (mm === 1 || mm === 4 || mm === 7 || mm === 10) {
        out.push({ i, text: `${SHORT[mm - 1]} ${m.slice(2, 4)}` });
      }
    }
    if (out.length > want) {
      const every = Math.ceil(out.length / want);
      return out.filter((_, k) => k % every === 0);
    }
    return out;
  }

  // Short span: months. The year appears on the first tick and each January,
  // so the axis is dated without repeating it twelve times.
  const step = span > want ? Math.ceil(span / want) : 1;
  for (let i = lo; i <= hi; i += step) {
    const m = months[i];
    if (!m) continue;
    const mm = Number(m.slice(5, 7));
    const name = SHORT[mm - 1] ?? m.slice(5, 7);
    out.push({
      i,
      text: i === lo || mm === 1 ? `${name} ${m.slice(0, 4)}` : name,
    });
  }
  return out;
}
