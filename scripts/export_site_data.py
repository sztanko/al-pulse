"""Export the dbt marts into the JSON payloads the static site is built from.

Everything here runs once at build time. The output lands in `site/data/`,
which is NOT served: Astro reads it during `astro build` and bakes the result
into HTML, passing only the rows a given island actually draws as props. The
one exception is `site/public/geo/`, which holds the map geometry — too large
to inline, so the map island fetches it.

Two shapes matter:

* a single shared month axis (`meta.json`), with every per-area series
  densified onto it, so a series is a bare array of numbers rather than a list
  of {month, value} objects;
* one shard per area, so an area page ships its own series and nothing else.
  Evidence shipped `stats` whole and warned it was 519.9 MB uncompressed.
"""

from __future__ import annotations

import json
import shutil
from datetime import date
from pathlib import Path
from typing import Any

import duckdb
import typer

app = typer.Typer(pretty_exceptions_enable=False, add_completion=False)

COUNTRY_AREA_ID = 0
COUNTRY_NAME = "Portugal"


# --------------------------------------------------------------------- utils
def write_json(path: Path, payload: Any) -> int:
    """Write compact JSON and return the byte size."""
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(payload, separators=(",", ":"), ensure_ascii=False, default=str)
    path.write_text(text, encoding="utf-8")
    return len(text.encode("utf-8"))


def rows_as_dicts(con: duckdb.DuckDBPyConnection, sql: str) -> list[dict]:
    """Query to a list of dicts without pulling in pandas.

    duckdb's .df() needs pandas, which this venv does not have and which this
    script has no other use for.
    """
    cur = con.execute(sql)
    cols = [d[0] for d in cur.description]
    return [dict(zip(cols, row)) for row in cur.fetchall()]


def month_axis(con: duckdb.DuckDBPyConnection) -> list[str]:
    """Every month present in region_stats, ascending, as YYYY-MM."""
    rows = con.execute(
        "SELECT DISTINCT strftime(year_month, '%Y-%m') AS m FROM region_stats ORDER BY 1"
    ).fetchall()
    return [r[0] for r in rows]


def densify(
    observed: dict[str, float | None],
    axis: list[str],
    carry: bool,
) -> list[float | None]:
    """Put a sparse {month: value} series onto the shared axis.

    `carry=True` forward-fills, which is what a cumulative count needs: a month
    with no row means the total did not change, not that it dropped to zero.
    `carry=False` fills 0, which is what a per-month count needs: no row means
    nothing was registered that month. Conflating the two is the "gaps are
    data" failure — they are genuinely different facts here.
    """
    out: list[float | None] = []
    last: float = 0.0
    for m in axis:
        if m in observed and observed[m] is not None:
            last = float(observed[m])  # type: ignore[arg-type]
            out.append(last)
        else:
            out.append(last if carry else 0.0)
    return out


def round_series(values: list[float | None], places: int = 4) -> list[Any]:
    """Trim float noise; integers stay integers so the JSON stays small."""
    out: list[Any] = []
    for v in values:
        if v is None:
            out.append(None)
        elif float(v).is_integer():
            out.append(int(v))
        else:
            out.append(round(float(v), places))
    return out


# ---------------------------------------------------------------- extraction
def fetch_area_rows(con: duckdb.DuckDBPyConnection) -> list[dict]:
    """One row per area: identity, hierarchy and the headline measures."""
    return rows_as_dicts(con, """
        SELECT
            a.osm_id            AS id,
            a.slug              AS slug,
            a.name              AS name,
            a.full_name         AS full_name,
            a.admin_type        AS admin_type,
            a.population        AS population,
            a.parent_id         AS parent_id,
            a.parent_name       AS parent_name,
            a.parent_path       AS parent_path,
            a.municipality_slug AS municipality_slug,
            a.region_slug       AS region_slug,
            s.al_count                  AS al_count,
            s.inhabitants_per_al        AS inhabitants_per_al,
            s.al_per_1000               AS al_per_1000,
            s.rank_within_country       AS rank_within_country,
            s.al_count_growth_pcnt      AS al_count_growth_pcnt,
            s.rank_within_country_change AS rank_within_country_change,
            s.direct_parent_slug        AS direct_parent_slug,
            s.ancestor_municipality_slug AS ancestor_municipality_slug,
            s.ancestor_region_slug      AS ancestor_region_slug,
            s.has_time_series           AS in_time_series
        FROM admin a
        -- INNER, not LEFT: `admin` carries every Portuguese area, including
        -- ones neither register lists, and a page for one would be a page of
        -- blanks. Since the Azorean regional register was added this yields
        -- 2,950 areas: 2,779 with a monthly history plus 171 Azorean ones
        -- known only as a current snapshot, flagged by `in_time_series`.
        JOIN area_summary s ON s.area_slug = a.slug
        WHERE a.admin_type IN ('region', 'municipality', 'locality')
        ORDER BY a.admin_type, a.name
        """)


def fetch_series(
    con: duckdb.DuckDBPyConnection, axis: list[str]
) -> dict[int, dict[str, list]]:
    """Per-area monthly series, densified onto the shared axis.

    Pulled in one query rather than per area: 492k rows is a single scan, and
    2,779 round trips is not.
    """
    rows = rows_as_dicts(con, """
        SELECT area_id,
               strftime(year_month, '%Y-%m')   AS m,
               value_c, cumulative_value_c,
               value_lost_licenses, cumulative_value_lost_licenses,
               country_rank_c, region_rank_c, municipality_rank_c,
               cumulative_value_al_per_1000
        FROM region_stats
        ORDER BY area_id, year_month
        """)

    per_area: dict[int, dict[str, dict]] = {}
    for r in rows:
        aid, m = r["area_id"], r["m"]
        c, cum_c = r["value_c"], r["cumulative_value_c"]
        lost, cum_lost = r["value_lost_licenses"], r["cumulative_value_lost_licenses"]
        rc, rr, rm = r["country_rank_c"], r["region_rank_c"], r["municipality_rank_c"]
        alk = r["cumulative_value_al_per_1000"]
        d = per_area.setdefault(
            aid, {"c": {}, "cum_c": {}, "lost": {}, "cum_lost": {},
                  "rank_c": {}, "rank_r": {}, "rank_m": {}, "al_per_1000": {}}
        )
        d["c"][m] = c
        d["cum_c"][m] = cum_c
        d["lost"][m] = lost
        d["cum_lost"][m] = cum_lost
        d["rank_c"][m] = rc
        d["rank_r"][m] = rr
        d["rank_m"][m] = rm
        d["al_per_1000"][m] = alk

    out: dict[int, dict[str, list]] = {}
    for aid, d in per_area.items():
        out[aid] = {
            "c": round_series(densify(d["c"], axis, carry=False)),
            "cum_c": round_series(densify(d["cum_c"], axis, carry=True)),
            "lost": round_series(densify(d["lost"], axis, carry=False)),
            "cum_lost": round_series(densify(d["cum_lost"], axis, carry=True)),
            "rank_c": round_series(densify(d["rank_c"], axis, carry=True)),
            "rank_r": round_series(densify(d["rank_r"], axis, carry=True)),
            "rank_m": round_series(densify(d["rank_m"], axis, carry=True)),
            "al_per_1000": round_series(densify(d["al_per_1000"], axis, carry=True)),
        }
    return out


def fetch_observed_months(con: duckdb.DuckDBPyConnection) -> list[str]:
    """The months the register was actually pulled.

    This matters more than it looks. A lost licence is only detectable
    *between* two consecutive snapshots, so the loss series says nothing at all
    about a month with no pull either side of it — and the register has been
    pulled 12 times in its life, with a six-month hole in 2026.

    Without this the loss chart draws a flat zero from 2012 to 2025, asserting
    that no registration ever lapsed in thirteen years, and then a cliff in the
    month we happened to look. "Zero" and "not observed" are different facts.
    """
    rows = con.execute(
        "SELECT DISTINCT strftime(etl_timestamp, '%Y-%m') AS m "
        "FROM al_raw_data ORDER BY 1"
    ).fetchall()
    return [r[0] for r in rows]


def fetch_events(con: duckdb.DuckDBPyConnection) -> list[dict]:
    """Policy events annotated onto the timelines. '#'-prefixed ones are hidden."""
    return rows_as_dicts(con, """
        SELECT strftime(event_date, '%Y-%m') AS month,
               event_date, event_name, description,
               event_name_pt, description_pt
        FROM events
        WHERE event_name NOT LIKE '#%'
        ORDER BY event_date
        """)


def fetch_skew(con: duckdb.DuckDBPyConnection) -> dict[str, dict]:
    """Concentration: what share of localities hold 50% of the ALs."""
    rows = rows_as_dicts(con, """
        SELECT slug, locality_rank_pcnt, total_population_pcnt,
               total_al_pcnt, prev_total_al_pcnt, locality_rank
        FROM distribution_skew
        WHERE threshold = '50'
        """)
    return {r["slug"]: r for r in rows}


def fetch_rooms(con: duckdb.DuckDBPyConnection) -> dict[str, list[dict]]:
    """Room-size distribution, each area against its comparison levels."""
    rows = rows_as_dicts(con, """
        SELECT slug, name, metric_name, room_category, value, admin_type,
               area_level, group_id, area_id
        FROM room_distribution_comparison
        ORDER BY slug, area_level, metric_name
        """)
    by_slug: dict[str, list[dict]] = {}
    for r in rows:
        by_slug.setdefault(r["slug"], []).append(r)
    return by_slug


def fetch_country_rooms(con: duckdb.DuckDBPyConnection) -> list[dict]:
    """The national room-size distribution, for the overview page.

    `room_distribution_comparison` is keyed by the area being *described*, and
    carries that area's comparison levels as rows — so the country row appears
    once per area and never under a slug of its own. Selecting it by slug
    (`rooms["portugal"]`) therefore returned nothing, and the overview showed a
    heading with no chart beneath it. It is one distribution repeated, so any
    one copy is the whole answer.
    """
    return rows_as_dicts(con, """
        SELECT DISTINCT ON (metric_name)
               name, metric_name, room_category, value, admin_type, area_level
        FROM room_distribution_comparison
        WHERE admin_type = 'country'
        ORDER BY metric_name, room_category
        """)


def fetch_azores_counts(con: duckdb.DuckDBPyConnection) -> tuple[int, int]:
    """How many establishments each register holds for the Azores.

    The second number is the point of the footnote. The national register does
    carry Azorean rows — it is not stale, and saying so would be wrong — it
    just carries a small fraction of them, because tourism is a regional
    competence and Azorean operators register regionally. Both numbers are
    read from the data so the explanation cannot drift from it.
    """
    regional = rows_as_dicts(con, """
        SELECT al_count FROM azores_area_stats WHERE admin_type = 'region'
        """)
    national = rows_as_dicts(con, """
        SELECT count(*) AS n
        FROM al_unmapped
        WHERE is_active AND lower(strip_accents(district)) = 'acores'
        """)
    return (
        int(regional[0]["al_count"]) if regional else 0,
        int(national[0]["n"]) if national else 0,
    )


def fetch_map_features(con: duckdb.DuckDBPyConnection) -> list[dict]:
    """Per-locality values the choropleth colours and labels."""
    return rows_as_dicts(con, """
        SELECT admin_id, id, name, full_name, slug, population,
               al_count, rank_within_country, people_per_al, people_per_al_rank,
               has_time_series
        FROM localities_with_data_for_geojson
        """)


# ------------------------------------------------------------------ assembly
def build_meta(
    axis: list[str],
    areas: list[dict],
    observed: list[str],
    azores_total: int,
    azores_in_rnal: int,
) -> dict:
    # Losses become detectable one month after the first snapshot, and stay
    # detectable only where consecutive snapshots bracket the month.
    obs = set(observed)
    loss_from = ""
    if len(observed) >= 2:
        i = axis.index(observed[0]) + 1 if observed[0] in axis else 0
        loss_from = axis[i] if i < len(axis) else ""
    unobserved = [
        m for m in axis
        if loss_from and m >= loss_from and m not in obs
    ]

    # How long each loss figure actually covers.
    #
    # A lost licence is only visible as the difference between two consecutive
    # pulls, so the number reported for a month is really the number for
    # "everything since the pull before it". While the register is pulled every
    # month that is one month and nobody need think about it. The register was
    # not pulled between March and September 2026, so September's figure covers
    # six months — drawn in one month's width it is a cliff six times taller
    # than anything around it, and it reads as a catastrophic September rather
    # than as half a year of ordinary attrition.
    #
    # Only spans longer than a month are recorded; a month is the default and
    # listing 170 of them would be noise.
    #
    # The arrivals series has no equivalent problem and must not be given one:
    # each record carries its own registration date, so a pull in September
    # still attributes an April registration to April.
    spans = []
    for prev, cur in zip(observed, observed[1:]):
        if prev not in axis or cur not in axis:
            continue
        n = axis.index(cur) - axis.index(prev)
        if n > 1:
            spans.append({"month": cur, "since": prev, "months": n})

    return {
        "months": axis,
        "observed_months": observed,
        "loss_observable_from": loss_from,
        # Months inside the loss window that no pull brackets: the loss figure
        # there is "not observed", not zero.
        "unobserved_months": unobserved,
        "loss_spans": spans,
        "generated": date.today().isoformat(),
        "data_through": axis[-1],
        "counts": {
            "areas": len(areas),
            "regions": sum(1 for a in areas if a["admin_type"] == "region"),
            "municipalities": sum(1 for a in areas if a["admin_type"] == "municipality"),
            "localities": sum(1 for a in areas if a["admin_type"] == "locality"),
        },
        # Everything the site needs to write the asterisk without hardcoding a
        # number that would go stale the month the register changes.
        "azores": {
            "listings": azores_total,
            "areas": sum(1 for a in areas if not a.get("in_time_series", True)),
            "municipalities": sum(
                1 for a in areas
                if not a.get("in_time_series", True) and a["admin_type"] == "municipality"
            ),
            "localities": sum(
                1 for a in areas
                if not a.get("in_time_series", True) and a["admin_type"] == "locality"
            ),
            "in_national_register": azores_in_rnal,
        },
    }


def build_shard(
    area: dict,
    series: dict[int, dict[str, list]],
    by_id: dict[int, dict],
    children: dict[int, list[dict]],
    skew: dict[str, dict],
    rooms: dict[str, list[dict]],
) -> dict:
    """Everything one area page draws, and nothing else."""
    aid = int(area["id"])
    own = series.get(aid)

    # Self, parent, grandparent, Portugal — the hierarchy the growth chart
    # compares. Ordered outward, which is the order the legend reads in.
    hierarchy: list[dict] = []
    node: dict | None = area
    while node is not None:
        s = series.get(int(node["id"]))
        if s:
            hierarchy.append({"name": node["full_name"], "slug": node["slug"],
                              "cum": s["cum_c"]})
        pid = node.get("parent_id")
        node = by_id.get(int(pid)) if pid is not None and not _isnan(pid) else None
    if COUNTRY_AREA_ID in series:
        hierarchy.append({"name": COUNTRY_NAME, "slug": None,
                          "cum": series[COUNTRY_AREA_ID]["cum_c"]})

    subareas = [
        {"name": c["name"], "slug": c["slug"], "cum": series[int(c["id"])]["cum_c"]}
        for c in children.get(aid, [])
        if int(c["id"]) in series
    ]

    return {
        "id": aid,
        "slug": area["slug"],
        "name": area["name"],
        "full_name": area["full_name"],
        "admin_type": area["admin_type"],
        "population": _clean(area["population"]),
        "parent": (
            {"slug": by_id[int(area["parent_id"])]["slug"],
             "name": by_id[int(area["parent_id"])]["name"]}
            if area.get("parent_id") is not None
            and not _isnan(area["parent_id"])
            and int(area["parent_id"]) in by_id
            else None
        ),
        "parent_path": area.get("parent_path"),
        # False for the Azores: their register has no registration dates, so
        # `series`, `hierarchy` and `subareas` are all empty here and the page
        # draws an explanation where the charts would go. Carried explicitly
        # rather than left for the site to infer from an empty array, which
        # would make a genuine data failure look like a documented absence.
        "in_time_series": bool(area.get("in_time_series", True)),
        "series": own,
        "hierarchy": hierarchy,
        "subareas": subareas,
        "skew": skew.get(area["slug"]),
        "rooms": rooms.get(area["slug"], []),
    }


def _isnan(v: Any) -> bool:
    try:
        return v != v  # NaN is the only value unequal to itself
    except Exception:
        return False


def _clean(v: Any) -> Any:
    if v is None or _isnan(v):
        return None
    if isinstance(v, float) and float(v).is_integer():
        return int(v)
    return v


# ---------------------------------------------------------------------- main
@app.command()
def main(
    db: Path = typer.Option(Path("data/prod.duckdb"), help="Built DuckDB database"),
    out: Path = typer.Option(Path("site/data"), help="Build-time payload directory"),
    geo_src: Path = typer.Option(
        Path("site/public/geo/localities.json"),
        help="Simplified locality geometry, written by scripts/export_to_geojson.sh",
    ),
) -> None:
    if not db.exists():
        raise typer.BadParameter(f"{db} not found — run scripts/run_etl.sh first")

    con = duckdb.connect(str(db), read_only=True)
    typer.echo(f"==> reading {db}")

    axis = month_axis(con)
    areas = fetch_area_rows(con)
    series = fetch_series(con, axis)
    events = fetch_events(con)
    skew = fetch_skew(con)
    rooms = fetch_rooms(con)
    map_rows = fetch_map_features(con)
    observed = fetch_observed_months(con)
    azores_total, azores_in_rnal = fetch_azores_counts(con)

    by_id = {int(a["id"]): a for a in areas}
    children: dict[int, list[dict]] = {}
    for a in areas:
        pid = a.get("parent_id")
        if pid is not None and not _isnan(pid):
            children.setdefault(int(pid), []).append(a)
    for kids in children.values():
        kids.sort(key=lambda r: str(r["name"]))

    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True, exist_ok=True)

    total = 0
    total += write_json(
        out / "meta.json",
        build_meta(axis, areas, observed, azores_total, azores_in_rnal),
    )
    total += write_json(
        out / "country.json",
        {
            "series": series.get(COUNTRY_AREA_ID),
            "skew": skew.get("portugal"),
            "events": events,
            "rooms": fetch_country_rooms(con),
        },
    )
    total += write_json(
        out / "areas.json",
        [
            {k: _clean(v) for k, v in a.items() if k not in ("geom",)}
            for a in areas
        ],
    )
    total += write_json(out / "events.json", events)
    # A metric with no value is *omitted*, not written as null. MapLibre has no
    # null test in its expression language, so a feature carrying
    # `"rank_within_country": null` has to be distinguished some other way —
    # and `["to-number", ["get", m], -1]` would coerce it to -1, which for an
    # inverted ramp is the *strongest* colour. Unranked Azorean localities
    # would have been painted as if they were rank 1. Omitting the key lets the
    # fill expression ask `["has", m]` and paint a no-data shade instead.
    total += write_json(
        out / "map.json",
        [{k: _clean(v) for k, v in r.items() if _clean(v) is not None} for r in map_rows],
    )

    shard_bytes = 0
    for a in areas:
        shard = build_shard(a, series, by_id, children, skew, rooms)
        shard_bytes += write_json(out / "a" / f"{a['slug']}.json", shard)
    total += shard_bytes

    if geo_src.exists():
        typer.echo(f"==> geometry: {geo_src.stat().st_size/1e6:.1f} MB at {geo_src}")
    else:
        typer.echo(
            f"!! {geo_src} missing — run scripts/export_to_geojson.sh first; "
            "the map page will render its fallback",
            err=True,
        )

    typer.echo(
        f"==> {len(areas)} areas, {len(axis)} months "
        f"({axis[0]}..{axis[-1]}), shards {shard_bytes/1e6:.1f} MB, "
        f"total {total/1e6:.1f} MB"
    )


if __name__ == "__main__":
    app()
