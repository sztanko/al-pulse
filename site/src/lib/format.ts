/** Formatting shared by the server-rendered marks and the islands. */

const EN = 'en-GB';

export const num0 = (v: number | null | undefined): string =>
  v == null || Number.isNaN(v) ? '—' : Math.round(v).toLocaleString(EN);

export const num1 = (v: number | null | undefined): string =>
  v == null || Number.isNaN(v)
    ? '—'
    : v.toLocaleString(EN, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export const pct1 = (v: number | null | undefined): string =>
  v == null || Number.isNaN(v)
    ? '—'
    : (v * 100).toLocaleString(EN, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';

/** A change, with an explicit neutral band.
 *
 * Below the band a change is not a direction: rendering a 0.2% move as a green
 * up-arrow asserts something the data does not support and the next refresh may
 * reverse it. `dir` is what the caller should colour on.
 */
export type Direction = 'up' | 'down' | 'flat';

export function delta(
  v: number | null | undefined,
  band = 0.005
): { text: string; dir: Direction } {
  if (v == null || Number.isNaN(v)) return { text: '—', dir: 'flat' };
  if (Math.abs(v) < band) return { text: 'no change', dir: 'flat' };
  const sign = v > 0 ? '+' : '−';
  return { text: `${sign}${pct1(Math.abs(v)).replace('-', '')}`, dir: v > 0 ? 'up' : 'down' };
}

/** A rank movement. Ranks improve downward, so the sign is inverted against
 * the arithmetic: −3 means "moved up three places". */
export function rankDelta(v: number | null | undefined): { text: string; dir: Direction } {
  if (v == null || Number.isNaN(v) || v === 0) return { text: 'no change', dir: 'flat' };
  const places = Math.abs(Math.round(v));
  const word = places === 1 ? 'place' : 'places';
  return v < 0
    ? { text: `↑ ${places} ${word}`, dir: 'up' }
    : { text: `↓ ${places} ${word}`, dir: 'down' };
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** "2026-09" → "September 2026" */
export function monthLabel(m: string): string {
  const [y = '', mm = ''] = m.split('-');
  return `${MONTH_NAMES[Number(mm) - 1] ?? mm} ${y}`.trim();
}

/** "2026-09" → "Sep 2026" */
export function monthShort(m: string): string {
  const [y = '', mm = ''] = m.split('-');
  const name = MONTH_NAMES[Number(mm) - 1] ?? mm;
  return `${name.slice(0, 3)} ${y}`.trim();
}

export const yearOf = (m: string): string => m.slice(0, 4);

/** Ratio as a multiple: 1.34 → "×1.34" */
export const mult = (v: number | null | undefined): string =>
  v == null || Number.isNaN(v)
    ? '—'
    : '×' + v.toLocaleString(EN, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const slugUrl = (base: string, slug: string): string =>
  `${base.replace(/\/$/, '')}/areas/${slug}`;
