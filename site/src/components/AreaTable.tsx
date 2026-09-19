/** Sortable table of areas with in-cell bars.
 *
 * Rules from the principles doc that this follows literally:
 *  - bar first, number second, same width every row;
 *  - one scale per column, computed over the whole set rather than the
 *    filtered view, so lengths keep comparing when the reader searches;
 *  - every column sortable, and searchable.
 */
import { useMemo, useState } from 'react';
/* Both dictionaries ship to the browser rather than the strings being threaded
 * in as props. The whole dictionary is a few kilobytes beside MapLibre and the
 * geometry, and an island that can translate itself cannot be handed the wrong
 * language by a caller that forgot a prop. */
import { fmt } from '../lib/format';
import { t, type Lang } from '../lib/i18n';
import './AreaTable.css';

export interface Row {
  slug: string;
  name: string;
  al_count: number | null;
  inhabitants_per_al: number | null;
  al_per_1000: number | null;
  rank_within_country: number | null;
  al_count_growth_pcnt: number | null;
  rank_within_country_change: number | null;
  /** Defaults to true. False for Azorean areas, whose register records no
   * dates: growth, rank and rank movement do not exist for them, and the
   * difference between "did not change" and "cannot be computed" is the whole
   * point of marking them. */
  in_time_series?: boolean;
}

export interface Props {
  lang: Lang;
  rows: Row[];
  base: string;
  caption: string;
  /** Rows shown before the "show all" control. */
  initial?: number;
}

// Sortable columns only. `in_time_series` is a property of the row, not a
// column in it, and leaving it in the key type makes the comparator try to
// subtract booleans.
type Key = keyof Omit<Row, 'slug' | 'in_time_series'>;

type ColKind = 'text' | 'bar' | 'delta' | 'rankdelta' | 'scale';
const COLUMNS: { key: Key; label: Parameters<typeof t>[1]; kind: ColKind }[] = [
  { key: 'name', label: 'table.area', kind: 'text' },
  { key: 'al_count', label: 'table.al_count', kind: 'bar' },
  { key: 'al_count_growth_pcnt', label: 'table.growth', kind: 'delta' },
  { key: 'inhabitants_per_al', label: 'table.inhabitants', kind: 'scale' },
  { key: 'rank_within_country', label: 'table.rank', kind: 'bar' },
  { key: 'rank_within_country_change', label: 'table.rank_change', kind: 'rankdelta' },
];

/** What a cell says when the figure cannot exist rather than being unknown.
 *
 * `rankDelta(null)` says "no change", which for an area with no history would
 * be a claim about a year that was never measured. These cells say so instead,
 * and the footnote under the table says why. */
const naText = (lang: Lang) => t(lang, 'table.na');



export default function AreaTable({ lang, rows, base, caption, initial = 25 }: Props) {
  const f = fmt(lang);
  const NOT_APPLICABLE = naText(lang);
  const [sort, setSort] = useState<{ key: Key; dir: 1 | -1 }>({
    key: 'al_count',
    dir: -1,
  });
  const [q, setQ] = useState('');
  const [all, setAll] = useState(false);

  // One scale per column, over the whole population — not the filtered view.
  const scales = useMemo(() => {
    const m = new Map<Key, number>();
    for (const c of COLUMNS) {
      if (c.kind !== 'bar' && c.kind !== 'scale') continue;
      let mx = 0;
      for (const r of rows) {
        const v = r[c.key];
        if (typeof v === 'number' && v > mx) mx = v;
      }
      m.set(c.key, mx || 1);
    }
    return m;
  }, [rows]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const base = needle
      ? rows.filter((r) => r.name.toLowerCase().includes(needle))
      : rows;
    const sorted = [...base].sort((a, b) => {
      const av = a[sort.key];
      const bv = b[sort.key];
      if (typeof av === 'string' || typeof bv === 'string') {
        return String(av ?? '').localeCompare(String(bv ?? '')) * sort.dir;
      }
      const an = av == null ? -Infinity : av;
      const bn = bv == null ? -Infinity : bv;
      return (an - bn) * sort.dir;
    });
    return sorted;
  }, [rows, q, sort]);

  const shown = all ? filtered : filtered.slice(0, initial);

  const toggle = (key: Key) =>
    setSort((s) =>
      s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: key === 'name' ? 1 : -1 }
    );

  return (
    <div className="at">
      <div className="at-head">
        <label className="at-search">
          <span className="at-search-label">
            {t(lang, 'table.search_label', { what: caption.toLowerCase() })}
          </span>
          <input
            type="search"
            value={q}
            placeholder={t(lang, 'table.search', { n: f.num0(rows.length) })}
            onChange={(e) => setQ(e.currentTarget.value)}
          />
        </label>
        <span className="small faint num">
          {filtered.length === rows.length
            ? `${rows.length} areas`
            : `${filtered.length} of ${rows.length}`}
        </span>
      </div>

      <div className="at-scroll">
        <table className="at-table">
          <caption className="at-caption">{caption}</caption>
          <thead>
            <tr>
              {COLUMNS.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  aria-sort={
                    sort.key === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'
                  }
                  className={c.kind === 'text' ? 'col-text' : 'col-num'}
                >
                  <button type="button" onClick={() => toggle(c.key)}>
                    {t(lang, c.label)}
                    <i aria-hidden="true">
                      {sort.key === c.key ? (sort.dir === 1 ? '▲' : '▼') : '↕'}
                    </i>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const timed = r.in_time_series !== false;
              const g = timed
                ? f.delta(r.al_count_growth_pcnt)
                : { text: NOT_APPLICABLE, dir: 'na' as const };
              const rc = timed
                ? f.rankDelta(r.rank_within_country_change)
                : { text: NOT_APPLICABLE, dir: 'na' as const };
              const alScale = scales.get('al_count') ?? 1;
              const rkScale = scales.get('rank_within_country') ?? 1;
              const ipaScale = scales.get('inhabitants_per_al') ?? 1;
              return (
                <tr key={r.slug} className={timed ? undefined : 'is-untimed'}>
                  <td className="col-text">
                    <a href={`${base}/areas/${r.slug}`}>{r.name}</a>
                  </td>
                  <td className="col-num">
                    <span className="cell-bar">
                      <i style={{ width: `${((r.al_count ?? 0) / alScale) * 100}%` }} />
                      <b className="num">{f.num0(r.al_count)}</b>
                    </span>
                  </td>
                  <td className={`col-num dir-${g.dir}`}>
                    <span className="num">{g.text}</span>
                  </td>
                  <td className="col-num">
                    <span className="cell-bar is-alt">
                      <i style={{ width: `${((r.inhabitants_per_al ?? 0) / ipaScale) * 100}%` }} />
                      <b className="num">{f.num0(r.inhabitants_per_al)}</b>
                    </span>
                  </td>
                  <td className="col-num">
                    {timed ? (
                      <span className="cell-bar is-rank">
                        <i
                          style={{
                            width: `${(1 - (r.rank_within_country ?? 0) / rkScale) * 100}%`,
                          }}
                        />
                        <b className="num">{f.num0(r.rank_within_country)}</b>
                      </span>
                    ) : (
                      // No bar at all, not a zero-length one: an empty bar in a
                      // column of bars reads as "lowest", and this area is not
                      // last, it is not in the ranking.
                      <span className="num dir-na">{NOT_APPLICABLE}</span>
                    )}
                  </td>
                  <td className={`col-num dir-${rc.dir}`}>
                    <span className="num">{rc.text}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {rows.some((r) => r.in_time_series === false) && (
        <p className="at-note small faint">
          {t(lang, 'table.na_note')}
        </p>
      )}

      {filtered.length > initial && (
        <button type="button" className="at-more" onClick={() => setAll((v) => !v)}>
          {all
            ? t(lang, 'table.show_first', { n: f.num0(initial) })
            : t(lang, 'table.show_all', { n: f.num0(filtered.length) })}
        </button>
      )}
    </div>
  );
}
