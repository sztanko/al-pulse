/** Sortable table of areas with in-cell bars.
 *
 * Rules from the principles doc that this follows literally:
 *  - bar first, number second, same width every row;
 *  - one scale per column, computed over the whole set rather than the
 *    filtered view, so lengths keep comparing when the reader searches;
 *  - every column sortable, and searchable.
 */
import { useMemo, useState } from 'react';
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
}

export interface Props {
  rows: Row[];
  base: string;
  caption: string;
  /** Rows shown before the "show all" control. */
  initial?: number;
}

type Key = keyof Omit<Row, 'slug'>;

const COLUMNS: { key: Key; label: string; kind: 'text' | 'bar' | 'delta' | 'rankdelta' | 'scale' }[] =
  [
    { key: 'name', label: 'Area', kind: 'text' },
    { key: 'al_count', label: 'AL count', kind: 'bar' },
    { key: 'al_count_growth_pcnt', label: 'Growth, 3 yr', kind: 'delta' },
    { key: 'inhabitants_per_al', label: 'Inhabitants per AL', kind: 'scale' },
    { key: 'rank_within_country', label: 'Rank', kind: 'bar' },
    { key: 'rank_within_country_change', label: 'Rank change', kind: 'rankdelta' },
  ];

const n0 = (v: number | null) => (v == null ? '—' : Math.round(v).toLocaleString('en-GB'));
const p1 = (v: number | null) =>
  v == null ? '—' : (v * 100).toFixed(1) + '%';

function deltaText(v: number | null): { t: string; d: string } {
  if (v == null) return { t: '—', d: 'flat' };
  if (Math.abs(v) < 0.005) return { t: 'no change', d: 'flat' };
  return { t: (v > 0 ? '+' : '−') + p1(Math.abs(v)), d: v > 0 ? 'up' : 'down' };
}

function rankText(v: number | null): { t: string; d: string } {
  if (v == null || v === 0) return { t: 'no change', d: 'flat' };
  const p = Math.abs(Math.round(v));
  return v < 0 ? { t: `↑ ${p}`, d: 'up' } : { t: `↓ ${p}`, d: 'down' };
}

export default function AreaTable({ rows, base, caption, initial = 25 }: Props) {
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
          <span className="at-search-label">Search {caption.toLowerCase()}</span>
          <input
            type="search"
            value={q}
            placeholder={`Search ${rows.length} areas…`}
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
                    {c.label}
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
              const g = deltaText(r.al_count_growth_pcnt);
              const rc = rankText(r.rank_within_country_change);
              const alScale = scales.get('al_count') ?? 1;
              const rkScale = scales.get('rank_within_country') ?? 1;
              const ipaScale = scales.get('inhabitants_per_al') ?? 1;
              return (
                <tr key={r.slug}>
                  <td className="col-text">
                    <a href={`${base}/areas/${r.slug}`}>{r.name}</a>
                  </td>
                  <td className="col-num">
                    <span className="cell-bar">
                      <i style={{ width: `${((r.al_count ?? 0) / alScale) * 100}%` }} />
                      <b className="num">{n0(r.al_count)}</b>
                    </span>
                  </td>
                  <td className={`col-num dir-${g.d}`}>
                    <span className="num">{g.t}</span>
                  </td>
                  <td className="col-num">
                    <span className="cell-bar is-alt">
                      <i style={{ width: `${((r.inhabitants_per_al ?? 0) / ipaScale) * 100}%` }} />
                      <b className="num">{n0(r.inhabitants_per_al)}</b>
                    </span>
                  </td>
                  <td className="col-num">
                    <span className="cell-bar is-rank">
                      <i style={{ width: `${(1 - (r.rank_within_country ?? 0) / rkScale) * 100}%` }} />
                      <b className="num">{n0(r.rank_within_country)}</b>
                    </span>
                  </td>
                  <td className={`col-num dir-${rc.d}`}>
                    <span className="num">{rc.t}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {filtered.length > initial && (
        <button type="button" className="at-more" onClick={() => setAll((v) => !v)}>
          {all ? `Show first ${initial}` : `Show all ${filtered.length}`}
        </button>
      )}
    </div>
  );
}
