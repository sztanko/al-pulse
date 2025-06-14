#!/usr/bin/env python3
"""
extract_admin_boundaries.py
CLI: 3-pass extractor → shapefile.
No geopandas/pandas, builds multipolygons itself.

Changes:
• Pass-1 now stores *every* relation, not only admin ones.
• After pass-1 a recursive walk resolves all ways needed by each
  admin relation, descending into sub-relations that may lack admin tags.
"""

from __future__ import annotations

import logging
from collections import defaultdict
from pathlib import Path
from typing import Dict, List, Set, Tuple
import json
import osmium  # type: ignore
import shapely.ops as sops
from shapely.geometry import MultiPolygon, Polygon, mapping, LineString
import fiona
import typer

# ─────────────────────────── logging ───────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(levelname)s | %(asctime)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger(__name__)

# ─────────────────────────── types ───────────────────────────
Tags = Dict[str, str]
Coord = Tuple[float, float]
WayRole = str  # 'outer' / 'inner' / other


class RelationInfo:
    """Holds raw membership info from pass-1."""

    __slots__ = (
        "tags",
        "way_members",  # list[(way_id, role)]
        "child_relations",  # list[(rel_id, role)]
        "outer_way_ids",  # filled after resolution
        "inner_way_ids",
    )

    def __init__(self, tags: Tags) -> None:
        self.tags: Tags = tags
        self.way_members: List[Tuple[int, WayRole]] = []
        self.child_relations: List[Tuple[int, WayRole]] = []
        self.outer_way_ids: List[int] = []
        self.inner_way_ids: List[int] = []


# ─────────────────────────── pass-1 ───────────────────────────
class RelationCollector(osmium.SimpleHandler):
    def __init__(self) -> None:
        super().__init__()
        self.relations: Dict[int, RelationInfo] = {}

    def relation(self, r: osmium.osm.Relation) -> None:
        rel = RelationInfo(dict(r.tags))
        for m in r.members:
            if m.type == "w":
                rel.way_members.append((m.ref, m.role or "outer"))
            elif m.type == "r":
                rel.child_relations.append((m.ref, m.role or "outer"))
        self.relations[r.id] = rel


# helper: role propagation
def _flip(role: WayRole) -> WayRole:
    if role == "outer":
        return "inner"
    if role == "inner":
        return "outer"
    return role


def resolve_relation_ways(
    rel_id: int,
    relations: Dict[int, RelationInfo],
    inherited_role: WayRole,
    seen: Set[int],
) -> Tuple[Set[int], Set[int]]:
    """DFS that returns (outer_ways, inner_ways) for rel_id."""
    if rel_id in seen:
        return set(), set()
    seen.add(rel_id)

    rel = relations.get(rel_id)
    if rel is None:
        return set(), set()

    outer: Set[int] = set()
    inner: Set[int] = set()

    # own way members
    for wid, role in rel.way_members:
        actual = role if inherited_role == "outer" else _flip(role)
        (outer if actual == "outer" else inner).add(wid)

    # recurse into child relations
    for child_id, child_role in rel.child_relations:
        if child_role == "subarea":
            # logging.warning("Skipping subarea relation %d", child_id)
            continue  # skip, not part of parent geometry
        child_inherited = child_role if inherited_role == "outer" else _flip(child_role)
        o, i = resolve_relation_ways(child_id, relations, child_inherited, seen)
        outer.update(o)
        inner.update(i)

    return outer, inner


def is_admin(rel: RelationInfo) -> bool:
    t = rel.tags
    return (
        "admin_level" in t
        and t.get("admin_level").isdigit()
        and int(t.get("admin_level", "0")) <= 8
        and int(t.get("admin_level", "0")) > 2
        # t.get("boundary") == "administrative"
        # or "admin_level" in t
        # or t.get("type") == "boundary"
    )


# ─────────────────────────── pass-2 ───────────────────────────
class WayCollector(osmium.SimpleHandler):
    def __init__(self, needed: Set[int]) -> None:
        super().__init__()
        self.needed = needed
        self.ways: Dict[int, List[int]] = {}
        self.nodes_needed: Set[int] = set()

    def way(self, w: osmium.osm.Way) -> None:
        if w.id not in self.needed:
            return
        node_ids = [n.ref for n in w.nodes]
        if len(node_ids) < 2:
            return
        self.ways[w.id] = node_ids
        self.nodes_needed.update(node_ids)


# ─────────────────────────── pass-3 ───────────────────────────
class NodeCollector(osmium.SimpleHandler):
    def __init__(self, needed: Set[int]) -> None:
        super().__init__()
        self.needed = needed
        self.coords: Dict[int, Coord] = {}

    def node(self, n: osmium.osm.Node) -> None:
        if n.id in self.needed:
            self.coords[n.id] = (n.location.lon, n.location.lat)


# ────────────── geometry helpers (unchanged) ──────────────
def assemble_rings(seqs: List[List[int]], coords: Dict[int, Coord]) -> List[LineString]:
    lines = [LineString([coords[nid] for nid in seq if nid in coords]) for seq in seqs]
    merged = sops.linemerge(lines)
    parts = [merged] if isinstance(merged, LineString) else list(merged.geoms)  # type: ignore[arg-type]
    return [LineString(poly.exterior.coords) for poly in sops.polygonize(parts)]


def build_multipolygon(
    outer_ids: List[int],
    inner_ids: List[int],
    ways: Dict[int, List[int]],
    coords: Dict[int, Coord],
) -> MultiPolygon | Polygon | None:
    outer_rings = assemble_rings([ways[w] for w in outer_ids if w in ways], coords)
    inner_rings = assemble_rings([ways[w] for w in inner_ids if w in ways], coords)

    polys = []
    for outer in outer_rings:
        holes = [inner.coords for inner in inner_rings if outer.contains(inner)]
        p = Polygon(outer, holes=holes)
        if not p.is_empty:  # p.is_valid and not p.is_empty:
            polys.append(p)
    if not polys:
        return None
    return MultiPolygon(polys) if len(polys) > 1 else polys[0]


# ────────────────────────── shapefile ──────────────────────────
def write_shp(path: Path, feats: list[tuple[Polygon | MultiPolygon, Tags]]) -> None:
    schema = {
        "geometry": "MultiPolygon",  # keep layer type fixed
        "properties": {
            "osm_id": "int:10",  # …attributes unchanged
            "name": "str:100",
            "pop": "int:10",
            "admin_lvl": "int:10",
            "brd_type": "str:30",
            "boundary": "str:30",
        },
    }

    with fiona.open(
        path, "w", driver="ESRI Shapefile", crs="EPSG:4326", schema=schema
    ) as dst:
        for geom, tags in feats:
            admin_level = int(tags.get("admin_level", 0))
            if admin_level < 2 or admin_level > 8:
                log.warning(
                    "Skipping admin level %d for relation %d",
                    admin_level,
                    tags.get("id", 0),
                )
                continue
            if isinstance(geom, Polygon):  # ← key fix
                geom = MultiPolygon([geom])

            dst.write(
                {
                    "geometry": mapping(geom),
                    "properties": {
                        "osm_id": tags.get("osm_id", 0),  # add relation ID
                        "name": tags.get("name", ""),
                        "pop": tags.get("population", 0),
                        "admin_lvl": tags.get("admin_level", 0),
                        "brd_type": tags.get("border_type", ""),
                        "boundary": tags.get("boundary", ""),
                    },
                }
            )


# ─────────── writers ───────────
def write_geojson(path: Path, feats: list[tuple[Polygon | MultiPolygon, Tags]]) -> None:
    fc = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": mapping(
                    geom if isinstance(geom, MultiPolygon) else MultiPolygon([geom])
                ),
                "properties": tags,  # all tags
            }
            for geom, tags in feats
        ],
    }
    path.write_text(json.dumps(fc, ensure_ascii=False))


# ─────────────────────────── CLI ───────────────────────────
app = typer.Typer(
    add_completion=False,
    help="Extract OSM administrative boundaries.",
    pretty_exceptions_enable=False,
)


@app.command()
def extract(
    pbf: Path = typer.Argument(..., exists=True, readable=True),
    output: Path = typer.Option(..., "--output", "-o", help="*.shp path"),
) -> None:
    log.info("Pass-1: read relations")
    rc = RelationCollector()
    rc.apply_file(str(pbf), locations=False, idx="none")  # fastest
    rels = rc.relations

    # resolve ways needed
    admin_rel_ids = [rid for rid, r in rels.items() if is_admin(r)]
    ways_needed: Set[int] = set()

    for rid in admin_rel_ids:
        out_set, in_set = resolve_relation_ways(rid, rels, "outer", set())
        rels[rid].outer_way_ids = list(out_set)
        rels[rid].inner_way_ids = list(in_set)
        ways_needed.update(out_set)
        ways_needed.update(in_set)

    log.info("Pass-2: read %d ways", len(ways_needed))
    wc = WayCollector(ways_needed)
    wc.apply_file(str(pbf), locations=False, idx="none")

    log.info("Pass-3: read %d nodes", len(wc.nodes_needed))
    nc = NodeCollector(wc.nodes_needed)
    nc.apply_file(str(pbf), locations=False, idx="none")

    log.info("Building geometries for %d admin relations", len(admin_rel_ids))
    # build geometries
    feats = []
    for rid in admin_rel_ids:
        rel = rels[rid]
        name = rel.tags.get("name", "")
        brd_type = rel.tags.get("border_type", "")
        admin_level = int(rel.tags.get("admin_level", 0))
        geom = build_multipolygon(
            rel.outer_way_ids, rel.inner_way_ids, wc.ways, nc.coords
        )
        if geom is not None:
            tags = rel.tags
            tags["osm_id"] = rid
            feats.append((geom, tags))
        else:
            log.warning(
                "relation %d (%s %s %d) invalid → skipped",
                rid,
                brd_type,
                name,
                admin_level,
            )

    log.info("Writing %d features", len(feats))
    if output.suffix.lower() == ".geojson":
        write_geojson(output, feats)
    else:
        if output.suffix.lower() != ".shp":
            log.warning(
                "Output file should have .shp or .geojson extension, using .shp"
            )
            output = output.with_suffix(".shp")
        write_shp(output, feats)
    log.info("Done.")


if __name__ == "__main__":  # pragma: no cover
    app()
