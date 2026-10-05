"""Give every AL registration a coordinate, and say how far to trust it.

The register publishes an address and a postcode but no coordinates. This
places each registration against INE's Base Nacional de Moradas (BNM) — about
5.9 million address points, CC BY 4.0, republished by OpenAddresses as one
CSV — and records which rule produced the point:

    address        same postcode, same street, same house number
    street         same postcode, same street, no such number on it
    street_cp4     the postcode is not in the BNM, but the street is, once,
                   in the same four-digit postcode area
    postcode       the median of the BNM points sharing the postcode
    postcode_area  the median of the BNM points sharing its first four digits
    none           nothing to go on

Each row also carries `precision_m`, the radius the point is likely good to:
for the median rules, the 90th-percentile distance from the median to the
points it was taken from — so a city-block postcode says tens of metres and a
rural one says kilometres, measured rather than assumed.

The output is a cache, committed at downloads/geocode/al_geocoded.csv.gz, so
CI can build the site without the 600 MB address file. Only registrations
whose postcode or address changed since the last run, or that were geocoded by
an older version of the rules, are recomputed.

The cache holds a point per registration. It is input to the pipeline and
never published on the site: everything the site shows is aggregated to an
area. Do not export it.

The BNM was last updated in 2019, so streets built since are missing; those
fall through to the postcode rules. That is the gap a further fallback (a
self-hosted Photon on the Portugal OSM extract) would close.
"""

from __future__ import annotations

import csv
import gzip
import io
import logging
import re
import shutil
import unicodedata
import urllib.request
import zipfile
from datetime import date
from pathlib import Path

import duckdb
import typer

app = typer.Typer(pretty_exceptions_enable=False)
log = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="==> %(message)s")

# Bump when the rules change: every row geocoded by an older version is redone.
GEOCODER_VERSION = 1

BNM_URL = (
    "https://data.openaddresses.io/cache/uploads/jeffdefacto/"
    "2026-02-23-921i3/pt_addresses.csv.zip"
)
DEFAULT_BNM_DIR = Path("data/bnm")
DEFAULT_AL_DIR = Path("downloads/al")
DEFAULT_CACHE = Path("downloads/geocode/al_geocoded.csv.gz")

# How alike two normalised street names must be to count as the same street.
STREET_MATCH = 0.90
# street_cp4 only when every point of that street in the CP4 area lies within
# this many metres of its median: the same name twice in one area is two
# streets, and picking one would be a guess presented as a match.
STREET_CP4_MAX_SPREAD_M = 1500
# A house number is a point; the BNM places it at the building entrance.
ADDRESS_PRECISION_M = 15

CACHE_COLUMNS = [
    "al_id", "input_key", "lat", "lng", "method", "confidence", "precision_m",
    "geocoder_version", "geocoded_on",
]

# Full words → the abbreviations INE uses. Applied to *both* sides, so a name
# the BNM spells out and the register abbreviates (or the reverse) still meets.
ABBREVIATIONS = {
    # street types
    "RUA": "R", "AVENIDA": "AV", "TRAVESSA": "TV", "PRACETA": "PCT",
    "ESTRADA": "ESTR", "LARGO": "LG", "URBANIZACAO": "URB", "BAIRRO": "BR",
    "CAMINHO": "CAM", "SITIO": "SIT", "PRACA": "PC", "BECO": "BC",
    "QUINTA": "QTA", "MONTE": "MTE", "CALCADA": "CC", "ALAMEDA": "AL",
    "CASAL": "CSL", "VEREDA": "VR", "ALDEAMENTO": "ALDT", "IMPASSE": "IMP",
    "VILA": "VLA", "LADEIRA": "LAD", "ESCADINHAS": "ESCNH", "ZONA": "ZN",
    "CAMPO": "CPO", "PATIO": "PTO", "RAMPA": "RAMP",
    # titles
    "DOUTOR": "DR", "DOUTORA": "DRA", "DOM": "D", "DONA": "D", "SAO": "S",
    "SANTO": "STO", "SANTA": "STA", "PROFESSOR": "PROF", "PROFESSORA": "PROF",
    "ENGENHEIRO": "ENG", "GENERAL": "GEN", "CAPITAO": "CAP", "CORONEL": "COR",
    "INFANTE": "INF", "PADRE": "PE", "MARQUES": "MQ", "VISCONDE": "VISC",
    "COMENDADOR": "COMEND", "NOSSA": "N", "SENHORA": "SRA", "SENHOR": "SR",
    "ALMIRANTE": "ALM", "MARECHAL": "MAL", "TENENTE": "TEN",
    "SARGENTO": "SARG", "DUQUE": "DQ", "CONSELHEIRO": "CONS", "MAJOR": "MAJ",
    "MONSENHOR": "MONS", "ARQUITECTO": "ARQ", "ARQUITETO": "ARQ",
    "COMANDANTE": "CMDT", "BRIGADEIRO": "BRIG", "FREI": "FR",
}
STOPWORDS = {"DE", "DA", "DO", "DAS", "DOS", "E", "D'", "A", "O", "AS", "OS"}

POSTCODE = re.compile(r"(\d{4})\s*-?\s*(\d{3})")
# The house number is the first number after the street, unless it is a lot
# ("lote 5", "LT 59"), which is not a door.
HOUSE = re.compile(r"^\s*(?!(?:LOTE|LT|LOT)\b)(\d{1,5})(?!\d)", re.IGNORECASE)


# ---------------------------------------------------------------- normalising
def strip_accents(s: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c)
    )


def normalise_street(raw: str | None) -> str:
    """'Rua Doutor Afonso Rodrigues Pereira' and 'R DR AFONSO RODRIGUES
    PEREIRA' both become 'R DR AFONSO RODRIGUES PEREIRA'."""
    if not raw:
        return ""
    s = strip_accents(str(raw)).upper()
    s = re.sub(r"[^A-Z0-9 ]+", " ", s)
    words = [ABBREVIATIONS.get(w, w) for w in s.split()]
    return " ".join(w for w in words if w not in STOPWORDS)


def normalise_postcode(raw: str | None) -> str | None:
    """'8600-128', '8600 128', '8600128' → '8600-128'. Anything else → None.

    The register's CP4-only forms ('8600', '8600-000') are not a postcode
    here: '-000' is the stand-in for "no CP3", and treating it as a real code
    would hand every one of them the same median."""
    if not raw:
        return None
    m = POSTCODE.search(str(raw))
    if not m or m.group(2) == "000":
        return None
    return f"{m.group(1)}-{m.group(2)}"


def cp4_of(raw: str | None) -> str | None:
    m = re.search(r"(\d{4})", str(raw or ""))
    return m.group(1) if m and m.group(1) != "0000" else None


def split_address(raw: str | None) -> tuple[str, str | None]:
    """'Rua Passos Manuel, 249 2º Tras' → ('Rua Passos Manuel', '249').

    Register addresses are '<street>, <number> <floor and side>'. With no
    comma there is no reliable way to tell a trailing number from part of the
    name ('Rua 25 de Abril'), so no number is taken."""
    if not raw:
        return "", None
    street, _, rest = str(raw).partition(",")
    m = HOUSE.match(rest)
    return street.strip(), (m.group(1).lstrip("0") or "0") if m else None


# --------------------------------------------------------------------- inputs
def ensure_bnm(bnm_dir: Path) -> Path:
    """The BNM CSV, downloaded and unpacked on first use (≈130 MB zipped)."""
    csv = bnm_dir / "pt_addresses.csv"
    if csv.exists():
        return csv
    bnm_dir.mkdir(parents=True, exist_ok=True)
    zipped = bnm_dir / "pt_addresses.csv.zip"
    if not zipped.exists():
        log.info(f"Downloading the Base Nacional de Moradas from {BNM_URL}")
        urllib.request.urlretrieve(BNM_URL, zipped)
    with zipfile.ZipFile(zipped) as z:
        with z.open("pt_addresses.csv") as src, open(csv, "wb") as dst:
            shutil.copyfileobj(src, dst)
    return csv


# -------------------------------------------------------------------- placing
GEOCODE_SQL = f"""
WITH
-- Distance in metres, flat-earth: fine at the scale of a postcode.
streets AS (
    SELECT postcode, street_norm,
           median(lat) AS lat, median(lng) AS lng, count(*) AS n
    FROM bnm WHERE street_norm <> ''
    GROUP BY ALL
),
street_spread AS (
    SELECT s.postcode, s.street_norm, s.lat, s.lng,
           quantile_cont(
               111320 * sqrt(power(b.lat - s.lat, 2)
                             + power((b.lng - s.lng) * cos(radians(s.lat)), 2)),
               0.9) AS p90_m
    FROM streets AS s
    JOIN bnm AS b USING (postcode, street_norm)
    GROUP BY ALL
),
postcodes AS (
    SELECT postcode, median(lat) AS lat, median(lng) AS lng FROM bnm GROUP BY 1
),
postcode_spread AS (
    SELECT p.postcode, p.lat, p.lng,
           quantile_cont(
               111320 * sqrt(power(b.lat - p.lat, 2)
                             + power((b.lng - p.lng) * cos(radians(p.lat)), 2)),
               0.9) AS p90_m
    FROM postcodes AS p JOIN bnm AS b USING (postcode)
    GROUP BY ALL
),
cp4s AS (
    SELECT cp4, median(lat) AS lat, median(lng) AS lng FROM bnm GROUP BY 1
),
cp4_spread AS (
    SELECT c.cp4, c.lat, c.lng,
           quantile_cont(
               111320 * sqrt(power(b.lat - c.lat, 2)
                             + power((b.lng - c.lng) * cos(radians(c.lat)), 2)),
               0.9) AS p90_m
    FROM cp4s AS c JOIN bnm AS b USING (cp4)
    GROUP BY ALL
),
-- Best-matching street inside the listing's own postcode.
street_in_cp7 AS (
    SELECT l.al_id, s.street_norm, s.lat, s.lng, s.p90_m,
           jaro_winkler_similarity(l.street_norm, s.street_norm) AS sim
    FROM listings AS l
    JOIN street_spread AS s ON s.postcode = l.postcode
    WHERE l.street_norm <> ''
    QUALIFY row_number() OVER (PARTITION BY l.al_id ORDER BY sim DESC) = 1
),
-- The same street name in the CP4 area, when the postcode itself is unknown.
cp4_streets AS (
    SELECT cp4, street_norm, median(lat) AS lat, median(lng) AS lng
    FROM bnm WHERE street_norm <> '' GROUP BY ALL
),
cp4_street_spread AS (
    SELECT c.cp4, c.street_norm, c.lat, c.lng,
           max(111320 * sqrt(power(b.lat - c.lat, 2)
                             + power((b.lng - c.lng) * cos(radians(c.lat)), 2))) AS max_m,
           quantile_cont(
               111320 * sqrt(power(b.lat - c.lat, 2)
                             + power((b.lng - c.lng) * cos(radians(c.lat)), 2)),
               0.9) AS p90_m
    FROM cp4_streets AS c JOIN bnm AS b USING (cp4, street_norm)
    GROUP BY ALL
),
street_in_cp4 AS (
    SELECT l.al_id, s.street_norm, s.lat, s.lng, s.p90_m, s.max_m,
           jaro_winkler_similarity(l.street_norm, s.street_norm) AS sim
    FROM listings AS l
    JOIN cp4_street_spread AS s ON s.cp4 = l.cp4
    WHERE l.street_norm <> ''
      AND (l.postcode IS NULL OR l.postcode NOT IN (SELECT postcode FROM postcodes))
    QUALIFY row_number() OVER (PARTITION BY l.al_id ORDER BY sim DESC) = 1
),
-- The door itself, on the matched street.
doors AS (
    SELECT l.al_id, median(b.lat) AS lat, median(b.lng) AS lng
    FROM listings AS l
    JOIN street_in_cp7 AS s ON s.al_id = l.al_id AND s.sim >= {STREET_MATCH}
    JOIN bnm AS b
      ON b.postcode = l.postcode AND b.street_norm = s.street_norm
     AND b.house_num = l.house_num
    WHERE l.house_num IS NOT NULL
    GROUP BY 1
)
SELECT
    l.al_id,
    l.input_key,
    CASE
        WHEN d.al_id IS NOT NULL THEN d.lat
        WHEN sc.sim >= {STREET_MATCH} THEN sc.lat
        WHEN s4.sim >= {STREET_MATCH} AND s4.max_m <= {STREET_CP4_MAX_SPREAD_M} THEN s4.lat
        WHEN p.postcode IS NOT NULL THEN p.lat
        WHEN c.cp4 IS NOT NULL THEN c.lat
    END AS lat,
    CASE
        WHEN d.al_id IS NOT NULL THEN d.lng
        WHEN sc.sim >= {STREET_MATCH} THEN sc.lng
        WHEN s4.sim >= {STREET_MATCH} AND s4.max_m <= {STREET_CP4_MAX_SPREAD_M} THEN s4.lng
        WHEN p.postcode IS NOT NULL THEN p.lng
        WHEN c.cp4 IS NOT NULL THEN c.lng
    END AS lng,
    CASE
        WHEN d.al_id IS NOT NULL THEN 'address'
        WHEN sc.sim >= {STREET_MATCH} THEN 'street'
        WHEN s4.sim >= {STREET_MATCH} AND s4.max_m <= {STREET_CP4_MAX_SPREAD_M} THEN 'street_cp4'
        WHEN p.postcode IS NOT NULL THEN 'postcode'
        WHEN c.cp4 IS NOT NULL THEN 'postcode_area'
        ELSE 'none'
    END AS method,
    round(CASE
        WHEN d.al_id IS NOT NULL THEN {ADDRESS_PRECISION_M}
        WHEN sc.sim >= {STREET_MATCH} THEN greatest(sc.p90_m, {ADDRESS_PRECISION_M})
        WHEN s4.sim >= {STREET_MATCH} AND s4.max_m <= {STREET_CP4_MAX_SPREAD_M}
            THEN greatest(s4.p90_m, {ADDRESS_PRECISION_M})
        WHEN p.postcode IS NOT NULL THEN greatest(p.p90_m, {ADDRESS_PRECISION_M})
        WHEN c.cp4 IS NOT NULL THEN greatest(c.p90_m, {ADDRESS_PRECISION_M})
    END) AS precision_m
FROM listings AS l
LEFT JOIN doors AS d ON d.al_id = l.al_id
LEFT JOIN street_in_cp7 AS sc ON sc.al_id = l.al_id
LEFT JOIN street_in_cp4 AS s4 ON s4.al_id = l.al_id
LEFT JOIN postcode_spread AS p ON p.postcode = l.postcode
LEFT JOIN cp4_spread AS c ON c.cp4 = l.cp4
"""


def register_udfs(con: duckdb.DuckDBPyConnection) -> None:
    """The normalisers, callable from SQL so the data never leaves DuckDB."""
    udfs = {
        "norm_street": normalise_street,
        "norm_postcode": normalise_postcode,
        "cp4_of": cp4_of,
        "street_part": lambda a: split_address(a)[0],
        "house_part": lambda a: split_address(a)[1],
    }
    for name, fn in udfs.items():
        con.create_function(name, fn, ["VARCHAR"], "VARCHAR", null_handling="special")


def load_bnm(con: duckdb.DuckDBPyConnection, path: Path) -> None:
    """`bnm`: one row per address point, with a normalised street."""
    con.execute(
        r"""
        CREATE TEMP TABLE bnm_raw AS
        SELECT street, house, postcode,
               try_cast(lon AS DOUBLE) AS lng, try_cast(lat AS DOUBLE) AS lat
        FROM read_csv(?, header=true, all_varchar=true, quote='"', delim=',')
        WHERE regexp_full_match(postcode, '\d{4}-\d{3}')
          AND try_cast(lat AS DOUBLE) IS NOT NULL
        """,
        [str(path)],
    )
    # Normalise each distinct street once, not each of 5.9M points.
    con.execute("""
        CREATE TEMP TABLE bnm_streets AS
        SELECT street, coalesce(norm_street(street), '') AS street_norm
        FROM (SELECT DISTINCT street FROM bnm_raw)
    """)
    con.execute(r"""
        CREATE TEMP TABLE bnm AS
        SELECT b.postcode, substr(b.postcode, 1, 4) AS cp4, s.street_norm,
               nullif(regexp_extract(b.house, '^\s*0*(\d+)', 1), '') AS house_num,
               b.lat, b.lng
        FROM bnm_raw AS b
        JOIN bnm_streets AS s ON b.street IS NOT DISTINCT FROM s.street
    """)
    con.execute("DROP TABLE bnm_raw")
    n = con.execute("SELECT count(*) FROM bnm").fetchone()[0]
    log.info(f"BNM: {n:,} address points")


def load_listings(con: duckdb.DuckDBPyConnection, al_dir: Path) -> int:
    """`all_listings`: the latest address of every registration ever seen.

    `input_key` fingerprints what the geocoder reads, so a row is redone only
    when its postcode or address actually changes."""
    con.execute(
        """
        CREATE TEMP TABLE raw_listings AS
        SELECT al_id, address, postal_code FROM (
            SELECT
                regexp_replace(trim("Nº de registo"), '/AL$', '') AS al_id,
                trim("Localização (Endereço)") AS address,
                trim("Localização (Código postal)") AS postal_code,
                row_number() OVER (
                    PARTITION BY regexp_replace(trim("Nº de registo"), '/AL$', '')
                    ORDER BY filename DESC
                ) AS rn
            FROM read_csv_auto(?, header=true, union_by_name=true,
                               filename=true, all_varchar=true)
        ) WHERE rn = 1
        """,
        [str(al_dir / "*.csv.gz")],
    )
    con.execute("""
        CREATE TEMP TABLE all_listings AS
        SELECT al_id, postcode, cp4, street_norm, house_num,
               substr(md5(concat_ws('|', postcode, cp4, street_norm, house_num)), 1, 16)
                   AS input_key
        FROM (
            SELECT al_id,
                   norm_postcode(postal_code) AS postcode,
                   cp4_of(postal_code) AS cp4,
                   coalesce(norm_street(street_part(address)), '') AS street_norm,
                   house_part(address) AS house_num
            FROM raw_listings
        )
    """)
    return con.execute("SELECT count(*) FROM all_listings").fetchone()[0]


def load_cache(con: duckdb.DuckDBPyConnection, path: Path) -> None:
    """`cache`: what was geocoded before (empty on the first run)."""
    con.execute("""
        CREATE TEMP TABLE cache (
            al_id VARCHAR, input_key VARCHAR, lat DOUBLE, lng DOUBLE,
            method VARCHAR, confidence VARCHAR, precision_m DOUBLE,
            geocoder_version INTEGER, geocoded_on VARCHAR
        )
    """)
    if path.exists():
        con.execute("INSERT INTO cache SELECT * FROM read_csv(?, header=true, all_varchar=true)",
                    [str(path)])


def select_todo(con: duckdb.DuckDBPyConnection, redo_all: bool) -> int:
    """`listings`: the registrations to (re)geocode this run."""
    con.execute(
        """
        CREATE TEMP TABLE listings AS
        SELECT * FROM all_listings AS l
        WHERE ? OR NOT EXISTS (
            SELECT 1 FROM cache AS c
            WHERE c.al_id = l.al_id AND c.input_key = l.input_key
              AND c.geocoder_version = ?
        )
        """,
        [redo_all, GEOCODER_VERSION],
    )
    return con.execute("SELECT count(*) FROM listings").fetchone()[0]


# A coarse label for people; `precision_m` is the number to compute with.
CONFIDENCE_SQL = """
    CASE
        WHEN method = 'address' THEN 'high'
        WHEN method IN ('street', 'street_cp4') AND precision_m <= 250 THEN 'high'
        WHEN method IN ('street', 'street_cp4', 'postcode') AND precision_m <= 1000
            THEN 'medium'
        WHEN method = 'none' THEN 'none'
        ELSE 'low'
    END
"""


def geocode(con: duckdb.DuckDBPyConnection) -> None:
    """`fresh`: a point, a method and a precision for every row of `listings`."""
    con.execute(
        f"""
        CREATE TEMP TABLE fresh AS
        SELECT al_id, input_key, round(lat, 6) AS lat, round(lng, 6) AS lng,
               method, {CONFIDENCE_SQL} AS confidence, precision_m,
               {GEOCODER_VERSION} AS geocoder_version, ? AS geocoded_on
        FROM ({GEOCODE_SQL})
        """,
        [date.today().isoformat()],
    )


def merged_rows(con: duckdb.DuckDBPyConnection) -> list[tuple]:
    """Old rows not redone, plus the fresh ones, in registration order."""
    cols = ", ".join(CACHE_COLUMNS)
    return con.execute(f"""
        SELECT {cols} FROM (
            SELECT {cols} FROM cache WHERE al_id NOT IN (SELECT al_id FROM fresh)
            UNION ALL BY NAME
            SELECT {cols} FROM fresh
        )
        ORDER BY try_cast(al_id AS BIGINT) NULLS LAST, al_id
    """).fetchall()


def write_cache(path: Path, rows: list[tuple]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    buf = io.StringIO()
    w = csv.writer(buf, lineterminator="\n")
    w.writerow(CACHE_COLUMNS)
    w.writerows(["" if v is None else v for v in r] for r in rows)
    # mtime=0 so an unchanged cache is byte-identical and git sees no change.
    with open(path, "wb") as raw, gzip.GzipFile(fileobj=raw, mode="wb", mtime=0) as gz:
        gz.write(buf.getvalue().encode())


def summarise(con: duckdb.DuckDBPyConnection, path: Path) -> None:
    rows = con.execute(
        """
        SELECT method, count(*) AS n, count(*) / sum(count(*)) OVER () AS share,
               median(precision_m) AS median_m
        FROM read_csv(?, header=true) GROUP BY 1 ORDER BY 2 DESC
        """,
        [str(path)],
    ).fetchall()
    for method, n, share, med in rows:
        med_s = "" if med is None else f"median ±{med:,.0f} m"
        log.info(f"  {method:<14} {n:>8,}  {share:6.1%}  {med_s}")


@app.command()
def main(
    al_dir: Path = typer.Option(DEFAULT_AL_DIR, help="Directory of AL pulls (*.csv.gz)"),
    bnm_dir: Path = typer.Option(DEFAULT_BNM_DIR, help="Where the BNM CSV is kept (gitignored)"),
    cache_path: Path = typer.Option(DEFAULT_CACHE, help="The committed geocode cache"),
    redo_all: bool = typer.Option(False, "--all", help="Recompute every row"),
) -> None:
    con = duckdb.connect()
    register_udfs(con)
    n = load_listings(con, al_dir)
    load_cache(con, cache_path)
    todo = select_todo(con, redo_all)
    log.info(f"{n:,} registrations, {todo:,} to geocode")
    if todo == 0:
        return
    load_bnm(con, ensure_bnm(bnm_dir))
    geocode(con)
    rows = merged_rows(con)
    write_cache(cache_path, rows)
    log.info(f"Wrote {cache_path}: {len(rows):,} rows")
    summarise(con, cache_path)


if __name__ == "__main__":
    app()
