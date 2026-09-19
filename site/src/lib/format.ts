/** Formatting shared by the server-rendered marks and the islands.
 *
 * Everything is bound to a language through `fmt(lang)` rather than exported
 * ready-made. There used to be bare `num0`, `pct1` and so on hard-wired to
 * `en-GB`; leaving those in place beside a Portuguese page would be the worst
 * kind of bug, because "114,987" and "114 987" both look like numbers and only
 * one of them is right for the reader. Making the language an argument means a
 * caller cannot forget it — there is nothing to call without it.
 */
import { LOCALE, type Lang } from './i18n';

const DASH = '—';

/** Month names. `Intl` gives Portuguese "setembro de 2026", which is what we
 * want for a long label, but its short form is "09/2026" — a number, useless
 * on an axis that is already numeric. So the short names are spelled out. */
const MONTHS_LONG: Record<Lang, string[]> = {
  en: [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ],
  // Lowercase, as Portuguese writes them.
  pt: [
    'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
  ],
};

const MONTHS_SHORT: Record<Lang, string[]> = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  pt: ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'],
};

/** "no change", and the words for a rank movement. */
const WORDS: Record<Lang, { noChange: string; place: string; places: string; of: string }> = {
  en: { noChange: 'no change', place: 'place', places: 'places', of: '' },
  pt: { noChange: 'sem alteração', place: 'lugar', places: 'lugares', of: 'de ' },
};

export type Direction = 'up' | 'down' | 'flat';

export interface Fmt {
  num0: (v: number | null | undefined) => string;
  num1: (v: number | null | undefined) => string;
  pct1: (v: number | null | undefined) => string;
  mult: (v: number | null | undefined) => string;
  /** "2026-09" → "September 2026" / "setembro de 2026" */
  monthLabel: (m: string) => string;
  /** "2026-09" → "Sep 2026" / "set 2026" */
  monthShort: (m: string) => string;
  /** Just the month name, for an axis that already shows the year. */
  monthName: (monthNumber: number) => string;
  delta: (v: number | null | undefined, band?: number) => { text: string; dir: Direction };
  rankDelta: (v: number | null | undefined) => { text: string; dir: Direction };
}

export function fmt(lang: Lang): Fmt {
  const loc = LOCALE[lang];
  const words = WORDS[lang];

  const num0: Fmt['num0'] = (v) =>
    v == null || Number.isNaN(v) ? DASH : Math.round(v).toLocaleString(loc);

  const num1: Fmt['num1'] = (v) =>
    v == null || Number.isNaN(v)
      ? DASH
      : v.toLocaleString(loc, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  const pct1: Fmt['pct1'] = (v) =>
    v == null || Number.isNaN(v)
      ? DASH
      : (v * 100).toLocaleString(loc, {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        }) + '%';

  return {
    num0,
    num1,
    pct1,
    mult: (v) =>
      v == null || Number.isNaN(v)
        ? DASH
        : '×' + v.toLocaleString(loc, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),

    monthLabel: (m) => {
      const [y = '', mm = ''] = m.split('-');
      const name = MONTHS_LONG[lang][Number(mm) - 1] ?? mm;
      // Portuguese joins them with "de": "setembro de 2026".
      return lang === 'pt' ? `${name} de ${y}`.trim() : `${name} ${y}`.trim();
    },

    monthShort: (m) => {
      const [y = '', mm = ''] = m.split('-');
      return `${MONTHS_SHORT[lang][Number(mm) - 1] ?? mm} ${y}`.trim();
    },

    monthName: (n) => MONTHS_SHORT[lang][n - 1] ?? String(n),

    /** A change, with an explicit neutral band.
     *
     * Below the band a change is not a direction: rendering a 0.2% move as a
     * green up-arrow asserts something the data does not support and the next
     * refresh may reverse it. `dir` is what the caller should colour on. */
    delta: (v, band = 0.005) => {
      if (v == null || Number.isNaN(v)) return { text: DASH, dir: 'flat' };
      if (Math.abs(v) < band) return { text: words.noChange, dir: 'flat' };
      const sign = v > 0 ? '+' : '−';
      return {
        text: `${sign}${pct1(Math.abs(v))}`,
        dir: v > 0 ? 'up' : 'down',
      };
    },

    /** A rank movement. Ranks improve downward, so the sign is inverted
     * against the arithmetic: −3 means "moved up three places". */
    rankDelta: (v) => {
      if (v == null || Number.isNaN(v) || v === 0) {
        return { text: words.noChange, dir: 'flat' };
      }
      const places = Math.abs(Math.round(v));
      const word = places === 1 ? words.place : words.places;
      return v < 0
        ? { text: `↑ ${places} ${word}`, dir: 'up' }
        : { text: `↓ ${places} ${word}`, dir: 'down' };
    },
  };
}

export const yearOf = (m: string): string => m.slice(0, 4);

export const slugUrl = (base: string, slug: string): string =>
  `${base.replace(/\/$/, '')}/areas/${slug}`;
