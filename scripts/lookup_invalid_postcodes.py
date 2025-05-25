import typer
import duckdb
import csv
import time
from pathlib import Path
from typing import Optional
from lookup_postcode import lookup_postcode  # assuming it's in lookup_postcode.py
import logging

app = typer.Typer(pretty_exceptions_enable=False)

DEFAULT_DB = "data/prod.duckdb"
DEFAULT_OUTPUT_DIR = Path("downloads/postal_code")
LOOKUP_FILE = "postal_code_lookup.csv"
INVALID_FILE = "invalid_postal_codes.csv"

logging.basicConfig(level=logging.INFO)
log = logging.getLogger(__name__)


def ensure_csv_headers(file_path: Path, headers: list):
    if not file_path.exists():
        with open(file_path, mode="w", newline="") as f:
            writer = csv.writer(f)
            writer.writerow(headers)


@app.command()
def main(
    db_path: str = typer.Option(DEFAULT_DB, help="Path to DuckDB database"),
    output_dir: Path = typer.Option(DEFAULT_OUTPUT_DIR, help="Directory to write CSVs"),
):
    output_dir.mkdir(parents=True, exist_ok=True)
    lookup_csv = output_dir / LOOKUP_FILE
    invalid_csv = output_dir / INVALID_FILE

    existing_postcodes = set()
    if lookup_csv.exists():
        with open(lookup_csv, mode="r", newline="") as f:
            reader = csv.reader(f)
            existing_postcodes = {row[0] for row in reader if row}
    if invalid_csv.exists():
        with open(invalid_csv, mode="r", newline="") as f:
            reader = csv.reader(f)
            existing_postcodes.update({row[0] for row in reader if row})

    conn = duckdb.connect(db_path)
    result = list(conn.execute("SELECT distinct postal_code FROM invalid_postcodes").fetchall())
    conn.close()
    if not result:
        log.info("No invalid postcodes found in the database.")
        return

    ensure_csv_headers(
        lookup_csv,
        [
            "postal_code",
            "title",
            "returned_postal_code",
            "district",
            "municipality",
            "locality",
            "lat",
            "lng",
        ],
    )
    ensure_csv_headers(invalid_csv, ["postal_code"])

    with open(lookup_csv, mode="a", newline="") as valid_f, open(
        invalid_csv, mode="a", newline=""
    ) as invalid_f:
        valid_writer = csv.writer(valid_f)
        invalid_writer = csv.writer(invalid_f)

        for (postcode,) in result:
            if postcode in existing_postcodes:
                # log.info(f"Skipping already processed postcode: {postcode}")
                continue
            data = lookup_postcode(postcode)
            if data:
                valid_writer.writerow(
                    [
                        postcode,
                        data["title"],
                        data["returned_postal_code"],
                        data["district"],
                        data["municipality"],
                        data["locality"],
                        data["lat"],
                        data["lng"],
                    ]
                )
                log.info(f"Valid: {postcode}")
            else:
                invalid_writer.writerow([postcode])
                log.info(f"Invalid: {postcode}")
            time.sleep(1)


if __name__ == "__main__":
    app()
