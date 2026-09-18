/** Build-time data access.
 *
 * Everything here runs during `astro build` and never in the browser. The JSON
 * lives in `site/data/`, which is not served: pages read it, bake the result
 * into HTML, and hand an island only the rows it actually draws.
 *
 * The types are narrow on purpose. A field accessor loose enough to accept any
 * key returns an empty array for a typo, and a page of em-dashes is what the
 * reader sees — so the mistake should be a build error instead.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const DATA = join(process.cwd(), 'data');

function read<T>(name: string): T {
  return JSON.parse(readFileSync(join(DATA, name), 'utf8')) as T;
}

export type AdminType = 'region' | 'municipality' | 'locality';

export interface Meta {
  months: string[];
  /** Months the register was actually pulled. */
  observed_months: string[];
  /** First month a lost licence could be detected at all — one month after the
   * first snapshot, since a loss needs two snapshots to be visible. */
  loss_observable_from: string;
  /** Months inside that window with no pull: the loss figure is unknown there,
   * not zero. */
  unobserved_months: string[];
  generated: string;
  data_through: string;
  counts: {
    areas: number;
    regions: number;
    municipalities: number;
    localities: number;
  };
}

/** One entry per area: identity, hierarchy and the headline measures. */
export interface AreaRow {
  id: number;
  slug: string;
  name: string;
  full_name: string;
  admin_type: AdminType;
  population: number | null;
  parent_id: number | null;
  parent_name: string | null;
  parent_path: string | null;
  municipality_slug: string | null;
  region_slug: string | null;
  al_count: number | null;
  inhabitants_per_al: number | null;
  al_per_1000: number | null;
  rank_within_country: number | null;
  al_count_growth_pcnt: number | null;
  rank_within_country_change: number | null;
  direct_parent_slug: string | null;
  ancestor_municipality_slug: string | null;
  ancestor_region_slug: string | null;
}

/** Monthly series, densified onto `meta.months`. */
export interface Series {
  c: number[];
  cum_c: number[];
  lost: number[];
  cum_lost: number[];
  rank_c: number[];
  rank_r: number[];
  rank_m: number[];
  al_per_1000: number[];
}

export interface NamedSeries {
  name: string;
  slug: string | null;
  cum: number[];
}

export interface Skew {
  slug: string;
  locality_rank_pcnt: number;
  total_population_pcnt: number;
  total_al_pcnt: number;
  prev_total_al_pcnt: number;
  locality_rank: number;
}

export interface RoomRow {
  slug: string;
  name: string;
  metric_name: string;
  room_category: string | null;
  value: number;
  admin_type: string;
  area_level: number;
  group_id: number;
  area_id: number;
}

export interface EventRow {
  month: string;
  event_date: string;
  event_name: string;
  description: string | null;
}

export interface Shard {
  id: number;
  slug: string;
  name: string;
  full_name: string;
  admin_type: AdminType;
  population: number | null;
  parent: { slug: string; name: string } | null;
  parent_path: string | null;
  series: Series;
  hierarchy: NamedSeries[];
  subareas: NamedSeries[];
  skew: Skew | null;
  rooms: RoomRow[];
}

export interface Country {
  series: Series;
  skew: Skew | null;
  events: EventRow[];
  rooms: RoomRow[];
}

export interface MapRow {
  admin_id: number;
  id: number;
  name: string;
  full_name: string;
  slug: string;
  population: number | null;
  al_count: number | null;
  rank_within_country: number | null;
  people_per_al: number | null;
  people_per_al_rank: number | null;
}

let _meta: Meta | null = null;
let _areas: AreaRow[] | null = null;
let _events: EventRow[] | null = null;

export const meta = (): Meta => (_meta ??= read<Meta>('meta.json'));
export const areas = (): AreaRow[] => (_areas ??= read<AreaRow[]>('areas.json'));
export const events = (): EventRow[] => (_events ??= read<EventRow[]>('events.json'));
export const country = (): Country => read<Country>('country.json');
export const mapRows = (): MapRow[] => read<MapRow[]>('map.json');
export const shard = (slug: string): Shard => read<Shard>(`a/${slug}.json`);

export const areasOfType = (t: AdminType): AreaRow[] =>
  areas().filter((a) => a.admin_type === t);

export const areaBySlug = (slug: string): AreaRow | undefined =>
  areas().find((a) => a.slug === slug);

/** Children of an area, by the relationship the summary table records. */
export function childrenOf(a: AreaRow): AreaRow[] {
  if (a.admin_type === 'region') {
    return areas()
      .filter((x) => x.admin_type === 'municipality' && x.direct_parent_slug === a.slug)
      .sort((x, y) => x.name.localeCompare(y.name));
  }
  if (a.admin_type === 'municipality') {
    return areas()
      .filter((x) => x.admin_type === 'locality' && x.direct_parent_slug === a.slug)
      .sort((x, y) => x.name.localeCompare(y.name));
  }
  return [];
}

/** Every locality under a region or municipality. */
export function localitiesUnder(a: AreaRow): AreaRow[] {
  return areas()
    .filter(
      (x) =>
        x.admin_type === 'locality' &&
        (x.ancestor_region_slug === a.slug || x.ancestor_municipality_slug === a.slug)
    )
    .sort((x, y) => x.name.localeCompare(y.name));
}

/* ------------------------------------------------------------ derivations */

/** Index of a month on the shared axis, or -1. */
export const monthIndex = (m: string): number => meta().months.indexOf(m);

/** The latest month with data — the axis is built from the marts, so this is
 * the last observation rather than today's date. */
export const lastMonth = (): string => {
  const ms = meta().months;
  return ms[ms.length - 1] ?? '';
};

/** Where the loss series starts being meaningful, as an index on the axis. */
export const lossStartIndex = (): number => {
  const i = meta().months.indexOf(meta().loss_observable_from);
  return i < 0 ? 0 : i;
};

/** Axis indices with no pull bracketing them. */
export const unobservedIndices = (): number[] => {
  const ms = meta().months;
  return meta().unobserved_months.map((m) => ms.indexOf(m)).filter((i) => i >= 0);
};

/** The peak of a cumulative series, *restricted to observed months*.
 *
 * Reporting a peak from an unobserved stretch is reporting an artefact: the
 * register is only ever seen on pull months, so between two pulls the series
 * is an interpolation and its local maximum means nothing.
 */
export function observedPeak(cum: number[]): { value: number; month: string; index: number } {
  const ms = meta().months;
  const obs = new Set(meta().observed_months);
  let best = -1;
  ms.forEach((m, i) => {
    if (!obs.has(m)) return;
    if (best < 0 || (cum[i] ?? 0) > (cum[best] ?? 0)) best = i;
  });
  if (best < 0) best = cum.length - 1;
  return { value: cum[best] ?? 0, month: ms[best] ?? '', index: best };
}

/** Lost licences in the most recent month, and across the current year. */
export function lostSummary(s: Series): { lastMonth: number; ytd: number; prevYear: number } {
  const months = meta().months;
  const last = months[months.length - 1] ?? '';
  const year = last.slice(0, 4);
  const prev = String(Number(year) - 1);
  let ytd = 0;
  let prevYear = 0;
  let lastM = 0;
  months.forEach((m, i) => {
    const v = s.lost[i] ?? 0;
    if (m === last) lastM = v;
    if (m.startsWith(year)) ytd += v;
    if (m.startsWith(prev)) prevYear += v;
  });
  return { lastMonth: lastM, ytd, prevYear };
}

/** Rebase a cumulative series so the chosen month reads 1. */
export function rebase(cum: number[], baseIndex: number): (number | null)[] {
  const b = cum[baseIndex];
  if (!b) return cum.map(() => null);
  return cum.map((v) => (v == null ? null : v / b));
}
