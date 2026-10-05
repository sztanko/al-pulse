"""Build a standalone slippy map of every geocoded AL in Madeira.

Writes index.html, points.geojson (id, status, precision — what the map draws)
and details.json (the property's register record — what a click shows) into
--out-dir.

run_report.sh builds it into site/public/madeira-map, so it is deployed with
the site at /al-pulse/madeira-map/ but linked from nowhere. It publishes each
property's point and its register record, but nothing about the operator
(see RAW_FIELDS / OPERATOR_COLUMNS).

Needs data/prod.duckdb built by run_etl.sh (for `al` and its geocode).
"""

from __future__ import annotations

import json
import logging
from pathlib import Path

import duckdb
import typer

app = typer.Typer(pretty_exceptions_enable=False)
log = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="==> %(message)s")

MADEIRA_REGION = "Madeira"
TEMPLATE = Path(__file__).parent / "templates" / "madeira_map.html"

# Register column → label in the popup, in the order shown. An allowlist: only
# what describes the property. Nothing about the operator is published — not
# their name, tax number, phone, mobile, fax or e-mail, nor their capacity,
# type or country — and `assert_no_operator_data` fails the build if any of it
# is added here.
RAW_FIELDS = [
    ("Nome do Alojamento", "Name"),
    ("Nº de registo", "Registration"),
    ("Modalidade", "Type"),
    ("Data do registo", "Registered"),
    ("Data Abertura Público", "Opened"),
    ("Nº Quartos", "Rooms"),
    ("Nº Camas", "Beds"),
    ("Nº Beliches", "Bunk beds"),
    ("Nº Utentes", "Guests"),
    ("Imóvel posterior a 1951", "Built after 1951"),
    ("Localização (Endereço)", "Address"),
    ("Localização (Código postal)", "Postcode"),
    ("Localização (Localidade)", "Locality"),
    ("Localização (Freguesia)", "Freguesia"),
    ("Localização (Concelho)", "Concelho"),
    ("Validade Seguro RC", "Insurance valid until"),
]

# Register columns that identify or contact the operator.
OPERATOR_COLUMNS = {
    "Nome do Titular da Exploração", "Titular Qualidade", "Titular Tipo",
    "Titular País", "Contribuinte", "Contacto Telefone", "Contacto Telemovel",
    "Contacto Fax", "Contacto Email",
}


def assert_no_operator_data() -> None:
    leaked = OPERATOR_COLUMNS & {col for col, _ in RAW_FIELDS}
    if leaked:
        raise SystemExit(f"Refusing to build: operator columns in the map: {sorted(leaked)}")


def raw_fields_sql() -> str:
    """Latest non-empty value of every register column, per registration."""
    parts = []
    for i, (col, _) in enumerate(RAW_FIELDS):
        quoted = '"' + col.replace('"', '""') + '"'
        parts.append(
            f"last(trim({quoted}::VARCHAR) ORDER BY etl_timestamp) "
            f"FILTER (WHERE nullif(trim({quoted}::VARCHAR), '') IS NOT NULL) AS f{i}"
        )
    return ",\n            ".join(parts)


def fetch_rows(con: duckdb.DuckDBPyConnection) -> list[dict]:
    """One row per geocoded Madeira registration, current or lost."""
    sql = f"""
        WITH raw AS (
            SELECT
                regexp_replace(trim("Nº de registo"), '/AL$', '') AS al_id,
                min(etl_timestamp)::DATE AS first_seen,
                max(etl_timestamp)::DATE AS last_seen,
                {raw_fields_sql()}
            FROM al_raw_data
            GROUP BY 1
        )
        SELECT
            al.al_id,
            st_y(al.geom) AS lat,
            st_x(al.geom) AS lng,
            al.is_active,
            al.geocode_method,
            al.geocode_confidence,
            al.geocode_precision_m,
            al.placement_method,
            al.locality_name,
            al.municipality_name,
            raw.*
        FROM al
        JOIN raw USING (al_id)
        WHERE al.region_name = ?
          AND al.geom IS NOT NULL
          AND al.geocode_method <> 'none'
          -- A point outside the municipality the register names is the
          -- geocoder's mistake (al_placement); drawing it would put the
          -- property somewhere it is not.
          AND NOT al.point_rejected
        ORDER BY al.al_id
    """
    cur = con.execute(sql, [MADEIRA_REGION])
    cols = [d[0] for d in cur.description]
    return [dict(zip(cols, r)) for r in cur.fetchall()]


def is_precise(row: dict) -> bool:
    """Drawn solid when the point is a door or a street; a ring when it is only
    the middle of a postcode, so nobody reads it as an exact location."""
    return row["geocode_method"] in ("address", "street", "street_cp4")


def to_points(rows: list[dict]) -> dict:
    return {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [round(r["lng"], 6), round(r["lat"], 6)]},
                "properties": {
                    "id": r["al_id"],
                    "active": bool(r["is_active"]),
                    "precise": is_precise(r),
                },
            }
            for r in rows
        ],
    }


def to_details(rows: list[dict]) -> dict:
    """id → ordered [label, value] sections, ready to render as-is."""
    out = {}
    for r in rows:
        register = [
            [label, r[f"f{i}"]] for i, (_, label) in enumerate(RAW_FIELDS) if r[f"f{i}"]
        ]
        status = [
            ["Status", "On the register" if r["is_active"] else "No longer on the register"],
            ["First seen", str(r["first_seen"])],
            ["Last seen", str(r["last_seen"])],
        ]
        location = [
            ["Geocoded by", r["geocode_method"]],
            ["Confidence", r["geocode_confidence"]],
            ["Precision", f"±{r['geocode_precision_m']:,.0f} m" if r["geocode_precision_m"] else None],
            ["Placed by", r["placement_method"]],
            ["Freguesia (OSM)", r["locality_name"]],
            ["Municipality (OSM)", r["municipality_name"]],
        ]
        out[r["al_id"]] = {
            "title": r["f0"] or r["al_id"],
            "active": bool(r["is_active"]),
            "sections": [
                ["Register", register],
                ["Status", status],
                ["Location", [[k, v] for k, v in location if v]],
            ],
        }
    return out


def write_outputs(out_dir: Path, points: dict, details: dict) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "points.geojson").write_text(json.dumps(points, separators=(",", ":")))
    (out_dir / "details.json").write_text(
        json.dumps(details, ensure_ascii=False, separators=(",", ":"), default=str)
    )
    (out_dir / "index.html").write_text(TEMPLATE.read_text())


@app.command()
def main(
    db: Path = typer.Option(Path("data/prod.duckdb"), help="DuckDB built by run_etl.sh"),
    out_dir: Path = typer.Option(Path("data/madeira_map"), help="Output directory (gitignored)"),
) -> None:
    assert_no_operator_data()
    con = duckdb.connect(str(db), read_only=True)
    con.execute("LOAD spatial")
    rows = fetch_rows(con)
    active = sum(1 for r in rows if r["is_active"])
    log.info(f"{len(rows):,} geocoded registrations in Madeira ({active:,} on the register)")
    write_outputs(out_dir, to_points(rows), to_details(rows))
    log.info(f"Wrote {out_dir}/ — serve with: python -m http.server -d {out_dir}")


if __name__ == "__main__":
    app()
