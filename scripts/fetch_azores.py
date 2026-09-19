"""Fetch the Azorean local-accommodation register (RRAL).

Why this exists at all: the Azores are an autonomous region and tourism is a
regional competence, so Azorean operators register with the Direção Regional do
Turismo rather than with RNAL. The national export this project scrapes carries
about 320 Azorean establishments; the regional register carries about 4,500.
That is why `models/marts/al.sql` excludes the Azores — not because the data is
stale, which it is not, but because the national register is the wrong register.

Where it comes from: `dados.gov.pt` publishes
"Alojamento Local em funcionamento na Região Autónoma dos Açores (RAA)"
(Secretaria Regional do Turismo, Mobilidade e Infraestruturas, CC-BY). Its only
resource is a QGIS Server WMS. There is no bulk download and no WFS — the
server advertises WFS but publishes an empty FeatureTypeList — so the features
are read through `GetFeatureInfo`, which QGIS Server will return as GeoJSON.
The portal pages themselves (turismo.azores.gov.pt, srea.azores.gov.pt) sit
behind a Cloudflare bot challenge and cannot be fetched at all; this service
endpoint is open.

**The register carries no dates.** No registration date, no opening date. That
is a property of the source, not of this script, and it is the reason the
Azores appear on the site as a current snapshot and are absent from every time
series. Each monthly pull is kept, so a series does accumulate going forward.

Usage:

    python scripts/fetch_azores.py                 # fetch, cleanse, write
    python scripts/fetch_azores.py --dry-run       # fetch and report, write nothing
    python scripts/fetch_azores.py --from-raw f.json.gz   # re-cleanse a saved pull

`--from-raw` exists so the rules can be changed and re-run against a pull that
is already on disk, without going back to the server.
"""

from __future__ import annotations

import csv
import gzip
import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import typer
from tenacity import (
    before_sleep_log,
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_random_exponential,
)

from azores_cleansing import (
    OUTPUT_COLUMNS,
    Report,
    cleanse_rows,
    deduplicate,
    validate,
)

WMS_URL = (
    "https://visualizador-idea.ambiente.azores.gov.pt/postgresql/externos/public/"
    "turismo_raa/cgi-bin/qgis_mapserv.fcgi"
)
LAYER = "al"
#: The layer's own declared extent, in the CRS the server offers.
BBOX_3857 = "-3480423.806,4430295.469,-2785271.211,4818644.298"
CRS = "EPSG:3857"

#: GetFeatureInfo returns what falls under the pixel at (I, J), so one request
#: cannot cover the archipelago. The grid below tiles the bbox exactly.
#:
#: This is the trap worth knowing about: a single 3x3 probe at the centre pixel
#: returns 1,499 features and looks like a complete pull. It is the central
#: island group alone — São Miguel comes back with one row and Flores, Corvo
#: and Santa Maria with none. Nothing in the response says so.
#:
#: The grid is 2x2 rather than 1x1 because QGIS Server rejects HEIGHT=1.
GRID = 2
FEATURE_COUNT = 50000
TIMEOUT_SECONDS = 180

OUT_DIR = Path("downloads/azores")
#: The raw pull holds the operator's name, e-mail and phone number. It is kept
#: for debugging and provenance but must never be committed, which is why it
#: goes somewhere `.gitignore` already covers rather than next to the CSV.
RAW_DIR = Path("downloads/azores/raw")

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s: %(message)s")
log = logging.getLogger("fetch_azores")

app = typer.Typer(pretty_exceptions_enable=False)


class FetchError(RuntimeError):
    pass


# ------------------------------------------------------------------- fetching


@retry(
    retry=retry_if_exception_type(FetchError),
    stop=stop_after_attempt(4),
    wait=wait_random_exponential(multiplier=2, max=60),
    before_sleep=before_sleep_log(log, logging.WARNING),
    reraise=True,
)
def fetch_tile(i: int, j: int) -> list[dict]:
    """One GetFeatureInfo request, returning the features under pixel (i, j)."""
    import urllib.error
    import urllib.parse
    import urllib.request

    params = {
        "SERVICE": "WMS",
        "VERSION": "1.3.0",
        "REQUEST": "GetFeatureInfo",
        "LAYERS": LAYER,
        "QUERY_LAYERS": LAYER,
        "CRS": CRS,
        "BBOX": BBOX_3857,
        "WIDTH": str(GRID),
        "HEIGHT": str(GRID),
        "I": str(i),
        "J": str(j),
        "FEATURE_COUNT": str(FEATURE_COUNT),
        "INFO_FORMAT": "application/geo+json",
    }
    url = f"{WMS_URL}?{urllib.parse.urlencode(params)}"
    request = urllib.request.Request(
        url, headers={"User-Agent": "al-pulse/1.0 (+github.com/sztanko/al-pulse)"}
    )
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            payload = response.read()
    except (urllib.error.URLError, TimeoutError) as exc:
        raise FetchError(f"pixel {i},{j}: {exc}") from exc

    try:
        parsed = json.loads(payload)
    except json.JSONDecodeError as exc:
        # QGIS Server answers errors as an XML ServiceExceptionReport with a
        # 200 or a 400; either way it is not the GeoJSON we asked for.
        raise FetchError(f"pixel {i},{j}: not JSON — {payload[:200]!r}") from exc

    features = parsed.get("features")
    if features is None:
        raise FetchError(f"pixel {i},{j}: response has no 'features'")
    return features


def fetch_all() -> list[dict]:
    """Every feature in the layer, deduplicated across the tiling grid."""
    seen: dict[str, dict] = {}
    per_tile: list[int] = []
    for i in range(GRID):
        for j in range(GRID):
            features = fetch_tile(i, j)
            per_tile.append(len(features))
            log.info("pixel %d,%d -> %d features", i, j, len(features))
            for feature in features:
                seen[str(feature.get("id"))] = feature

    if not per_tile:
        raise FetchError("no tiles were fetched")
    if max(per_tile) >= FEATURE_COUNT:
        # Hitting the cap means the server truncated and the pull is partial,
        # with nothing in the response to say so.
        raise FetchError(
            f"a tile returned {max(per_tile)} features, the FEATURE_COUNT cap — "
            "the pull is truncated; raise FEATURE_COUNT or subdivide the grid"
        )
    if len(seen) <= max(per_tile):
        raise FetchError(
            f"the union ({len(seen)}) is no larger than the biggest single tile "
            f"({max(per_tile)}) — the grid is not covering the archipelago"
        )
    log.info("%d distinct features across %d tiles", len(seen), len(per_tile))
    return list(seen.values())


# -------------------------------------------------------------------- output


def write_raw(features: list[dict], raw_dir: Path, stamp: str) -> Path:
    raw_dir.mkdir(parents=True, exist_ok=True)
    path = raw_dir / f"azores_al_{stamp}.raw.json.gz"
    with gzip.open(path, "wt", encoding="utf-8") as handle:
        json.dump(
            {"fetched_at": stamp, "features": features}, handle, ensure_ascii=False
        )
    log.info("raw pull kept at %s (not committed — it holds personal data)", path)
    return path


def read_raw(path: Path) -> list[dict]:
    opener = gzip.open if path.suffix == ".gz" else open
    with opener(path, "rt", encoding="utf-8") as handle:
        payload = json.load(handle)
    return payload["features"] if isinstance(payload, dict) else payload


def write_csv(rows: list[dict], out_dir: Path, stamp: str) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / f"azores_al_{stamp}.csv.gz"
    with gzip.open(path, "wt", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=OUTPUT_COLUMNS)
        writer.writeheader()
        writer.writerows(rows)
    return path


def write_report(report: Report, gates: list, out_dir: Path, stamp: str) -> Path:
    path = out_dir / f"azores_al_{stamp}.report.json"
    payload = report.as_dict()
    payload["fetched_at"] = stamp
    payload["gates"] = [{"name": g.name, "ok": g.ok, "detail": g.detail} for g in gates]
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    return path


def previous_row_count(out_dir: Path) -> int | None:
    """Rows in the most recent committed pull, for the partial-pull gate."""
    existing = sorted(out_dir.glob("azores_al_*.csv.gz"))
    if not existing:
        return None
    with gzip.open(existing[-1], "rt", encoding="utf-8") as handle:
        return max(0, sum(1 for _ in handle) - 1)


def summarise(report: Report, gates: list) -> None:
    log.info(
        "fetched %d, wrote %d, dropped %d",
        report.fetched,
        report.written,
        report.dropped,
    )
    for rule, count in report.by_rule():
        log.info("  %-34s %6d", rule, count)
    for gate in gates:
        log.info(
            "  gate %-20s %-4s %s", gate.name, "ok" if gate.ok else "FAIL", gate.detail
        )


# ----------------------------------------------------------------------- CLI


@app.command()
def main(
    out_dir: Path = typer.Option(OUT_DIR, help="Where the cleansed CSV is written"),
    raw_dir: Path = typer.Option(RAW_DIR, help="Where the untouched pull is kept"),
    from_raw: Path = typer.Option(
        None, help="Re-cleanse this saved raw pull instead of fetching"
    ),
    dry_run: bool = typer.Option(False, help="Fetch and report, but write nothing"),
    keep_raw: bool = typer.Option(True, help="Keep the raw pull for provenance"),
) -> None:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")

    if from_raw is not None:
        log.info("re-cleansing %s", from_raw)
        features = read_raw(from_raw)
    else:
        features = fetch_all()
        if keep_raw and not dry_run:
            write_raw(features, raw_dir, stamp)

    report = Report(fetched=len(features))
    rows = deduplicate(cleanse_rows(features, report), report)
    report.written = len(rows)

    gates = validate(rows, report, previous_row_count(out_dir))
    summarise(report, gates)

    failed = [g for g in gates if not g.ok]
    if failed:
        for gate in failed:
            log.error("gate %s failed: %s", gate.name, gate.detail)
        raise typer.Exit(code=1)

    if dry_run:
        log.info("--dry-run: nothing written")
        return

    csv_path = write_csv(rows, out_dir, stamp)
    report_path = write_report(report, gates, out_dir, stamp)
    log.info("wrote %s (%d rows) and %s", csv_path, len(rows), report_path)


if __name__ == "__main__":
    app()
