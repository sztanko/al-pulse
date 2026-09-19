"""Geometry for the district portraits.

Each district page carries a drawn map of itself: its own outline and the
municipalities inside it. It is artwork rather than a map you can use — there
is no zoom, no labels and no data on it — so the geometry is simplified hard.
A coastline that reads as a coastline at 600px wide does not need twenty
thousand points; Faro's outline goes from 21,086 to about a thousand and looks
the same, at a fortieth of the weight.

One file per district, fetched by the drawing when it scrolls into view — the
same arrangement the choropleth uses for the locality geometry. Inlining it
into the page was the first attempt and put 78 kB of coordinates into Beja's
HTML; the artwork is decorative, so it has no business delaying the document.

Coordinates are projected and quantised here rather than in the browser. The
drawing is a fixed-size canvas, so anything finer than its pixel grid is
storage spent on precision that cannot be seen: points are integers in a
0..1000 box, which is both smaller than decimal degrees and simpler to draw —
the island scales, and does no cartography.

Simplification is `ST_SimplifyPreserveTopology` rather than `ST_Simplify`,
because the municipalities tile the district exactly and a plain
Douglas-Peucker pass opens gaps and overlaps between neighbours that are very
visible when you draw their shared borders as lines.
"""

from __future__ import annotations

import json
from pathlib import Path

import duckdb
import typer

app = typer.Typer(pretty_exceptions_enable=False)

#: Degrees, and deliberately coarse. This is a drawing, and at the size it is
#: drawn the fine wiggle of a real coastline is not character, it is noise —
#: a thousand-point outline comes out looking like a jagged vector trace,
#: which is exactly the wrong impression. Faro's outline is 21,086 points in
#: the source, 996 at the tolerance this started with, and 231 here: the last
#: of those is the one that looks hand-drawn, because the brush and the spline
#: through it have room to do their work between the points.
TOL_OUTLINE = 0.0035
TOL_INNER = 0.005

#: Rings smaller than this are dropped. About a hectare in the projection's
#: own units — sandbanks and digitising slivers that render as single specks.
#: Deliberately small: the Azores are nine genuinely tiny islands in a very
#: large bounding box and every one of them is the point.
MIN_RING_AREA = 2e-7


def rings_of(geojson: dict) -> list[list[list[float]]]:
    """Every exterior ring in a Polygon or MultiPolygon, largest first.

    Interior rings — holes — are dropped. A municipality entirely surrounded by
    another is drawn as its own shape anyway, so the hole would only ever be
    redundant, and a brush stroke has no concept of an even-odd fill.
    """
    kind = geojson.get("type")
    if kind == "Polygon":
        polys = [geojson["coordinates"]]
    elif kind == "MultiPolygon":
        polys = geojson["coordinates"]
    else:
        return []

    out: list[list[list[float]]] = []
    for poly in polys:
        if not poly:
            continue
        ring = [[round(x, 5), round(y, 5)] for x, y in poly[0]]
        if len(ring) >= 4 and abs(shoelace(ring)) >= MIN_RING_AREA:
            out.append(ring)
    out.sort(key=lambda r: -abs(shoelace(r)))
    return out


def shoelace(ring: list[list[float]]) -> float:
    total = 0.0
    for i in range(len(ring) - 1):
        x1, y1 = ring[i]
        x2, y2 = ring[i + 1]
        total += x1 * y2 - x2 * y1
    return total / 2.0


def bbox_of(rings: list[list[list[float]]]) -> list[float]:
    xs = [p[0] for r in rings for p in r]
    ys = [p[1] for r in rings for p in r]
    return [min(xs), min(ys), max(xs), max(ys)]


#: The projected box the drawing works in. A thousand units across a canvas
#: that is never wider than about 800 css pixels, so a unit is under a pixel
#: even at 2x.
SPAN = 1000


def projector(bbox: list[float]):
    """Equirectangular, with longitude squeezed by the latitude it sits at.

    Not a real projection, and it does not need to be: a district is at most
    150 km across, over which the error of treating the meridians as parallel
    is invisible. Leaving out the cos(lat) term is what is *not* acceptable —
    at 40° north it would stretch every district half as wide again.
    """
    import math

    minx, miny, maxx, maxy = bbox
    k = math.cos(math.radians((miny + maxy) / 2))
    w = (maxx - minx) * k
    h = maxy - miny
    scale = SPAN / max(w, h, 1e-9)

    def project(ring: list[list[float]]) -> list[int]:
        flat: list[int] = []
        for x, y in ring:
            flat.append(round((x - minx) * k * scale))
            # Screen coordinates: north is up, so latitude is inverted.
            flat.append(round((maxy - y) * scale))
        return flat

    return project, round(w * scale), round(h * scale)


def fetch(con: duckdb.DuckDBPyConnection, sql: str) -> list[dict]:
    cur = con.execute(sql)
    cols = [d[0] for d in cur.description]
    return [dict(zip(cols, row)) for row in cur.fetchall()]


def build(con: duckdb.DuckDBPyConnection) -> dict:
    districts = fetch(
        con,
        f"""
        SELECT slug, name, osm_id,
               st_asgeojson(st_simplifypreservetopology(geom, {TOL_OUTLINE})) AS gj
        FROM admin
        WHERE admin_type = 'region'
        ORDER BY name
        """,
    )
    municipalities = fetch(
        con,
        f"""
        SELECT parent_id, slug, name,
               st_asgeojson(st_simplifypreservetopology(geom, {TOL_INNER})) AS gj
        FROM admin
        WHERE admin_type = 'municipality'
        ORDER BY name
        """,
    )

    inner: dict[int, list[dict]] = {}
    for m in municipalities:
        inner.setdefault(int(m["parent_id"]), []).append(m)

    out: dict[str, dict] = {}
    for d in districts:
        outline = rings_of(json.loads(d["gj"]))
        if not outline:
            continue
        # The bounding box is of the outline alone. Taking it over the
        # municipalities as well would let a simplification artefact a few
        # metres outside the coast decide the framing.
        project, w, h = projector(bbox_of(outline))
        parts = []
        for m in inner.get(int(d["osm_id"]), []):
            rings = rings_of(json.loads(m["gj"]))
            if rings:
                parts.append({"rings": [project(r) for r in rings]})
        out[d["slug"]] = {
            "name": d["name"],
            "w": w,
            "h": h,
            "outline": [project(r) for r in outline],
            "parts": parts,
        }
    return out


@app.command()
def main(
    db: Path = typer.Option(Path("data/prod.duckdb"), help="Built DuckDB database"),
    out_dir: Path = typer.Option(
        Path("site/public/geo/districts"), help="One JSON per district"
    ),
) -> None:
    if not db.exists():
        raise typer.BadParameter(f"{db} not found — run scripts/run_etl.sh first")

    con = duckdb.connect(str(db), read_only=True)
    con.execute("INSTALL spatial; LOAD spatial;")
    art = build(con)

    out_dir.mkdir(parents=True, exist_ok=True)
    for stale in out_dir.glob("*.json"):
        stale.unlink()

    total = 0
    biggest = ("", 0)
    for slug, payload in art.items():
        path = out_dir / f"{slug}.json"
        path.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
        size = path.stat().st_size
        total += size
        if size > biggest[1]:
            biggest = (slug, size)

    typer.echo(
        f"==> {len(art)} district drawings, {total / 1000:.0f} kB in all; "
        f"largest is {biggest[0]} at {biggest[1] / 1000:.0f} kB"
    )


if __name__ == "__main__":
    app()
