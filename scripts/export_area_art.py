"""Geometry for the drawn area portraits, at every level.

Each area page opens with a picture of itself in its surroundings: the area,
the areas inside it coloured by how many registrations they hold, and the
neighbouring areas of the same level fading away at the edges. The country page
gets the mainland plus the two archipelagos as insets, because drawing Portugal
to a bounding box that includes the Azores puts the mainland in one corner and
1,500 km of ocean in the rest.

**The files are shared, not one per area.** A locality's picture is its
municipality's localities plus a ring of neighbours, and every locality in that
municipality needs exactly the same shapes — so there is one file per
municipality serving all of them, and the page says which of the shapes is the
focus. Written per area it would be 2,950 files and some 10 MB; written this
way it is 637 files and about a fifth of that, with a better cache-hit rate
when a reader walks from one locality to the one next door.

Coordinates stay geographic here, quantised to a per-file fixed point. They
cannot be pre-projected as the district-only version did: one file serves many
foci, and each focus has its own viewport, so the projection has to happen in
the browser where the focus is known.

Each shape also carries a population and a label point, for the three largest
places on each map. "Largest" is by population, and "place" is the drawn area
itself: at district level those areas are municipalities, which take the name
of their principal town, so the three labels read as the three cities. A level
down they are freguesias, where the same rule gives the three biggest
settlements in the municipality. The label point is `ST_PointOnSurface` rather
than a centroid, because a centroid of a horseshoe-shaped municipality is
outside it.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import duckdb
import typer

app = typer.Typer(pretty_exceptions_enable=False)

#: How far outside the focus the picture reaches, as a multiple of the focus's
#: own bounding box. 1.5 shows a comfortable ring of neighbours without
#: shrinking the subject to the point where its shape stops being readable.
ZOOM = 1.5

#: Simplification tolerance in degrees, per level. Coarse on purpose: this is
#: drawn with a brush at a few hundred pixels, and detail finer than the
#: stroke is not character, it is noise. Finer at each level down because the
#: areas are smaller and the viewport with them.
TOL = {
    "country": 0.004,
    "region": 0.0035,
    "municipality": 0.0012,
    "locality": 0.00045,
}

#: Rings smaller than this are dropped — digitising slivers and sandbanks that
#: render as a single speck. Small enough to keep Corvo.
MIN_RING_AREA = 2e-7

AZORES_SLUG = "acores"
MADEIRA_SLUG = "madeira"


# --------------------------------------------------------------- geometry
def shoelace(ring: list[tuple[float, float]]) -> float:
    total = 0.0
    for i in range(len(ring) - 1):
        total += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]
    return total / 2.0


def rings_of(gj: str | None) -> list[list[tuple[float, float]]]:
    """Exterior rings of a Polygon or MultiPolygon, largest first.

    Holes are dropped: an enclosed area is drawn as its own shape anyway, and a
    brush stroke has no concept of an even-odd fill.
    """
    if not gj:
        return []
    geo = json.loads(gj)
    kind = geo.get("type")
    if kind == "Polygon":
        polys = [geo["coordinates"]]
    elif kind == "MultiPolygon":
        polys = geo["coordinates"]
    else:
        return []

    out = []
    for poly in polys:
        if not poly:
            continue
        ring = [(x, y) for x, y in poly[0]]
        if len(ring) >= 4 and abs(shoelace(ring)) >= MIN_RING_AREA:
            out.append(ring)
    out.sort(key=lambda r: -abs(shoelace(r)))
    return out


def bbox(rings) -> tuple[float, float, float, float]:
    xs = [p[0] for r in rings for p in r]
    ys = [p[1] for r in rings for p in r]
    return min(xs), min(ys), max(xs), max(ys)


def viewport(b: tuple[float, float, float, float]) -> tuple[float, float, float, float]:
    """The focus box, grown about its centre by ZOOM."""
    minx, miny, maxx, maxy = b
    cx, cy = (minx + maxx) / 2, (miny + maxy) / 2
    # Longitude degrees are shorter than latitude ones here, so the box is
    # grown in *projected* proportions or a wide area would gain far more
    # context east-west than north-south.
    k = math.cos(math.radians(cy))
    hw = max((maxx - minx) * k, (maxy - miny)) * ZOOM / 2
    return cx - hw / k, cy - hw, cx + hw / k, cy + hw


# Rings whose boxes come within this of each other are the same island.
ISLAND_GAP = 0.15
# Ocean kept between islands once they are packed, as a share of the mean
# island size. Enough to read them as separate, not enough to waste the frame.
ISLAND_GUTTER = 0.14
# Islands are packed into rows chosen to land near this width-to-height ratio,
# which is roughly the shape of the column an inset is drawn into.
ISLAND_ASPECT = 1.4


def _box_of(ring) -> tuple[float, float, float, float]:
    xs = [p[0] for p in ring]
    ys = [p[1] for p in ring]
    return min(xs), min(ys), max(xs), max(ys)


def close_the_ocean(ring_sets: list[list]) -> list[list]:
    """Pack an archipelago's islands together, keeping their sizes and order.

    The Azores span 600 km of Atlantic and are 99% water. Fitted honestly into
    an inset the size of a postcard, every island is four pixels of outline and
    the fill has nothing to sit in — which is exactly what the first version
    drew. Madeira has the same problem more mildly, Porto Santo and the
    Desertas being most of its bounding box.

    So the water is taken out and the land is not touched: islands keep their
    true relative sizes and their west-to-east order, only the distances
    between them shrink. This is the ordinary inset device -- the same one that
    puts Alaska in a box off San Diego -- and the caption says *arranged*
    rather than *located* because of it.

    `ring_sets` is a list of ring-lists (one per shape, all sharing a
    coordinate frame); the return is the same structure, translated. Shapes are
    never split: a municipality's rings move as one with the island they sit
    on, which is what keeps a coastline continuous across the boundary between
    two municipalities of the same island.
    """
    rings = [(i, r) for i, rs in enumerate(ring_sets) for r in rs]
    if len(rings) < 2:
        return ring_sets

    boxes = [_box_of(r) for _, r in rings]
    lat0 = sum((b[1] + b[3]) / 2 for b in boxes) / len(boxes)
    k = math.cos(math.radians(lat0)) or 1.0
    # Work in projected units so a gap in longitude means the same as a gap in
    # latitude; convert back on the way out.
    px = lambda b: (b[0] * k, b[1], b[2] * k, b[3])
    pboxes = [px(b) for b in boxes]

    parent = list(range(len(rings)))

    def find(a: int) -> int:
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    def union(a: int, b: int) -> None:
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[rb] = ra

    for i in range(len(rings)):
        for j in range(i + 1, len(rings)):
            a, b = pboxes[i], pboxes[j]
            near = (
                a[0] - b[2] <= ISLAND_GAP
                and b[0] - a[2] <= ISLAND_GAP
                and a[1] - b[3] <= ISLAND_GAP
                and b[1] - a[3] <= ISLAND_GAP
            )
            if near:
                union(i, j)
    # Deliberately *not* also unioning the rings of one shape. The archipelago
    # outline is a single shape with nine rings in it, so that rule made the
    # whole of the Azores one island and packed nothing -- which is how the
    # first attempt came out looking exactly like the version it replaced.
    # Grouping by proximity alone is also the right answer for the shapes it
    # was meant to protect: an islet belonging to a municipality on another
    # island travels with the island it actually sits beside, which is what a
    # reader would expect to see.

    islands: dict[int, list[int]] = {}
    for idx in range(len(rings)):
        islands.setdefault(find(idx), []).append(idx)
    if len(islands) < 2:
        return ring_sets

    groups = []
    for members in islands.values():
        x0 = min(pboxes[i][0] for i in members)
        y0 = min(pboxes[i][1] for i in members)
        x1 = max(pboxes[i][2] for i in members)
        y1 = max(pboxes[i][3] for i in members)
        groups.append({"members": members, "box": (x0, y0, x1, y1)})
    groups.sort(key=lambda g: g["box"][0])

    gutter = ISLAND_GUTTER * (
        sum(max(g["box"][2] - g["box"][0], g["box"][3] - g["box"][1]) for g in groups)
        / len(groups)
    )

    def shelve(limit: float) -> tuple[list[tuple[float, float]], float, float]:
        """Lay the islands out left to right, wrapping past `limit`."""
        places: list[tuple[float, float]] = []
        x = y = 0.0
        row_h = 0.0
        width = 0.0
        for g in groups:
            w = g["box"][2] - g["box"][0]
            h = g["box"][3] - g["box"][1]
            if places and x + w > limit:
                x = 0.0
                y += row_h + gutter
                row_h = 0.0
            places.append((x, y))
            x += w + gutter
            row_h = max(row_h, h)
            width = max(width, x - gutter)
        return places, width, y + row_h

    total_w = sum(g["box"][2] - g["box"][0] for g in groups) + gutter * (len(groups) - 1)
    best = None
    for rows in range(1, len(groups) + 1):
        places, w, h = shelve(total_w / rows + 1e-9)
        if h <= 0 or w <= 0:
            continue
        cost = abs(math.log((w / h) / ISLAND_ASPECT))
        if best is None or cost < best[0]:
            best = (cost, places)
    places = best[1]

    # North stays up: a shelf grows downward, so rows are laid out from the
    # top and the y offset is subtracted.
    shift = [(0.0, 0.0)] * len(rings)
    for g, (gx, gy) in zip(groups, places):
        dx = gx - g["box"][0]
        dy = -gy - g["box"][3]
        for i in g["members"]:
            shift[i] = (dx / k, dy)

    out: list[list] = [[] for _ in ring_sets]
    for idx, (owner, ring) in enumerate(rings):
        dx, dy = shift[idx]
        out[owner].append([(x + dx, y + dy) for x, y in ring])
    return out


def overlaps(a, b) -> bool:
    return not (a[2] < b[0] or b[2] < a[0] or a[3] < b[1] or b[3] < a[1])


# ------------------------------------------------------------------ writing
class Packer:
    """Quantises a file's coordinates to integers against a shared origin.

    The scale is chosen per file so the largest coordinate lands near 20,000:
    five digits, about a metre at locality scale and ten at country scale,
    which is finer than the brush that draws it either way.
    """

    def __init__(self, box: tuple[float, float, float, float]):
        minx, miny, maxx, maxy = box
        self.ox, self.oy = minx, miny
        span = max(maxx - minx, maxy - miny, 1e-9)
        self.scale = 20000 / span

    def pack(self, rings) -> list[list[int]]:
        out = []
        for ring in rings:
            flat: list[int] = []
            for x, y in ring:
                flat.append(round((x - self.ox) * self.scale))
                flat.append(round((y - self.oy) * self.scale))
            out.append(flat)
        return out

    def point(self, pt: tuple[float, float]) -> list[int]:
        x, y = pt
        return [round((x - self.ox) * self.scale), round((y - self.oy) * self.scale)]

    def header(self) -> dict:
        return {"o": [round(self.ox, 6), round(self.oy, 6)], "s": round(self.scale, 3)}


def write(path: Path, payload: dict) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    return path.stat().st_size


# ------------------------------------------------------------------ loading
def load_level(con, level: str) -> dict[str, dict]:
    rows = con.execute(
        f"""
        SELECT a.slug, a.name, a.osm_id, a.parent_id,
               st_asgeojson(st_simplifypreservetopology(a.geom, {TOL[level]})) AS gj,
               s.al_count AS al_count,
               a.population,
               st_x(st_pointonsurface(a.geom)) AS lx,
               st_y(st_pointonsurface(a.geom)) AS ly
        FROM admin a
        LEFT JOIN area_summary s ON s.area_slug = a.slug
        WHERE a.admin_type = '{level}'
        """
    ).fetchall()

    out: dict[str, dict] = {}
    for slug, name, osm_id, parent_id, gj, count, pop, lx, ly in rows:
        rings = rings_of(gj)
        if not rings:
            continue
        out[slug] = {
            "slug": slug,
            "name": name,
            "osm_id": int(osm_id),
            "parent_id": int(parent_id) if parent_id is not None else None,
            "count": int(count) if count is not None else None,
            "pop": int(pop) if pop is not None else None,
            "label": (lx, ly) if lx is not None and ly is not None else None,
            "rings": rings,
            "bbox": bbox(rings),
        }
    return out


def sub_entry(a: dict, packer: Packer) -> dict:
    entry = {
        "slug": a["slug"],
        "name": a["name"],
        "count": a["count"],
        "r": packer.pack(a["rings"]),
    }
    if a.get("pop"):
        entry["pop"] = a["pop"]
    if a.get("label"):
        entry["lp"] = packer.point(a["label"])
    return entry


def context_for(focus: dict, siblings: dict[str, dict], packer: Packer) -> list[dict]:
    """Same-level areas visible in the focus's viewport, nearest first.

    Nearest first so the drawing can fade them by their position in the list
    without recomputing distances: the ones at the edge are the ones that
    should be faintest.
    """
    vp = viewport(focus["bbox"])
    cx = (focus["bbox"][0] + focus["bbox"][2]) / 2
    cy = (focus["bbox"][1] + focus["bbox"][3]) / 2
    near = []
    for other in siblings.values():
        if other["slug"] == focus["slug"] or not overlaps(vp, other["bbox"]):
            continue
        ox = (other["bbox"][0] + other["bbox"][2]) / 2
        oy = (other["bbox"][1] + other["bbox"][3]) / 2
        near.append((math.hypot(ox - cx, oy - cy), other))
    near.sort(key=lambda t: t[0])
    return [{"r": packer.pack(o["rings"])} for _, o in near]


@app.command()
def main(
    db: Path = typer.Option(Path("data/prod.duckdb"), help="Built DuckDB database"),
    out_dir: Path = typer.Option(Path("site/public/geo/art"), help="Where to write"),
) -> None:
    if not db.exists():
        raise typer.BadParameter(f"{db} not found — run scripts/run_etl.sh first")

    con = duckdb.connect(str(db), read_only=True)
    con.execute("INSTALL spatial; LOAD spatial;")

    regions = load_level(con, "region")
    municipalities = load_level(con, "municipality")
    localities = load_level(con, "locality")

    by_parent_m: dict[int, list[dict]] = {}
    for m in municipalities.values():
        by_parent_m.setdefault(m["parent_id"], []).append(m)
    by_parent_l: dict[int, list[dict]] = {}
    for l in localities.values():
        by_parent_l.setdefault(l["parent_id"], []).append(l)

    if out_dir.exists():
        for stale in out_dir.rglob("*.json"):
            stale.unlink()

    total = 0
    counts = {"country": 0, "region": 0, "municipality": 0, "locality": 0}

    # ------------------------------------------------------------- country
    # The mainland only, with the archipelagos as insets. A bounding box that
    # contains both Portugal and the Azores is 2,000 km wide and puts the
    # country this site is about in one corner of it.
    def island_group(slug: str) -> dict | None:
        region = regions.get(slug)
        if not region:
            return None
        subs = by_parent_m.get(region["osm_id"], [])
        # The outline and the municipalities are packed in one call, so that
        # both get the same translation per island -- packed separately they
        # would drift and the outline would no longer sit on its own coast.
        moved = close_the_ocean([region["rings"]] + [m["rings"] for m in subs])
        focus_rings, sub_rings = moved[0], moved[1:]
        # A label point travels with the shape it labels. It is not on a ring,
        # so it moves by its own municipality's offset: the difference between
        # where that shape's first point started and where it is now.
        moved_subs = []
        for m, rings in zip(subs, sub_rings):
            shifted = {**m, "rings": rings}
            if m.get("label") and m["rings"] and rings:
                dx = rings[0][0][0] - m["rings"][0][0][0]
                dy = rings[0][0][1] - m["rings"][0][0][1]
                shifted["label"] = (m["label"][0] + dx, m["label"][1] + dy)
            moved_subs.append(shifted)

        packer = Packer(viewport(bbox(focus_rings)))
        return {
            **packer.header(),
            "name": region["name"],
            "focus": packer.pack(focus_rings),
            "subs": [sub_entry(m, packer) for m in moved_subs],
            "ctx": [],
        }

    mainland = [r for s, r in regions.items() if s not in (AZORES_SLUG, MADEIRA_SLUG)]
    mainland_rings = [ring for r in mainland for ring in r["rings"]]
    mainland_box = bbox(mainland_rings)
    cpack = Packer(mainland_box)
    country = {
        **cpack.header(),
        "name": "Portugal",
        # The mainland's outline is its districts drawn together: there is no
        # "mainland" row in `admin`, and unioning the geometry to make one
        # would only produce the same edge at more cost.
        "focus": [ring for r in mainland for ring in cpack.pack(r["rings"])],
        "subs": [sub_entry(r, cpack) for r in mainland],
        "ctx": [],
        # The Azores first, so they are drawn above Madeira: they lie some
        # 500 km north-west of it, and a column that ran the other way put the
        # southern archipelago on top of the northern one.
        "insets": [g for g in (island_group(AZORES_SLUG), island_group(MADEIRA_SLUG)) if g],
    }
    total += write(out_dir / "country.json", country)
    counts["country"] += 1

    # ------------------------------------------------------------- regions
    for region in regions.values():
        # Madeira and the Azores have no neighbours to show, and the check is
        # the general one rather than a name: nothing else is within reach.
        # They do need the ocean taken out, for the same reason the insets do,
        # and the country page's insets are built by exactly this call.
        if region["slug"] in (AZORES_SLUG, MADEIRA_SLUG):
            payload = {**island_group(region["slug"]), "ctx": []}
        else:
            packer = Packer(viewport(region["bbox"]))
            payload = {
                **packer.header(),
                "name": region["name"],
                "focus": packer.pack(region["rings"]),
                "subs": [sub_entry(m, packer) for m in by_parent_m.get(region["osm_id"], [])],
                "ctx": context_for(region, regions, packer),
            }
        total += write(out_dir / "region" / f"{region['slug']}.json", payload)
        counts["region"] += 1

    # ------------------------------------------------------- municipalities
    for muni in municipalities.values():
        packer = Packer(viewport(muni["bbox"]))
        payload = {
            **packer.header(),
            "name": muni["name"],
            "focus": packer.pack(muni["rings"]),
            "subs": [sub_entry(l, packer) for l in by_parent_l.get(muni["osm_id"], [])],
            "ctx": context_for(muni, municipalities, packer),
        }
        total += write(out_dir / "municipality" / f"{muni['slug']}.json", payload)
        counts["municipality"] += 1

    # ----------------------------------------------------------- localities
    # One file per municipality, serving every locality in it. Each locality's
    # own viewport is computed in the browser; what is stored is the pool of
    # shapes any of them might need.
    for muni in municipalities.values():
        kids = by_parent_l.get(muni["osm_id"], [])
        if not kids:
            continue
        pool = {k["slug"]: k for k in kids}
        # Plus the neighbours just outside the municipality, so a locality on
        # its edge is not drawn against an empty margin.
        for kid in kids:
            vp = viewport(kid["bbox"])
            for other in localities.values():
                if other["slug"] not in pool and overlaps(vp, other["bbox"]):
                    pool[other["slug"]] = other

        packer = Packer(bbox([r for a in pool.values() for r in a["rings"]]))
        payload = {
            **packer.header(),
            "areas": [sub_entry(a, packer) for a in pool.values()],
        }
        total += write(out_dir / "locality" / f"{muni['slug']}.json", payload)
        counts["locality"] += 1

    typer.echo(
        f"==> {sum(counts.values())} files "
        f"({counts['country']} country, {counts['region']} region, "
        f"{counts['municipality']} municipality, {counts['locality']} locality pools), "
        f"{total / 1e6:.2f} MB"
    )


if __name__ == "__main__":
    app()
