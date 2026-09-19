#!/bin/bash -e

source ./scripts/constants.sh

echo "Running ETL process..."

rm -f $DUCKDB_LOCATION
mkdir -p "$(dirname "$DUCKDB_LOCATION")"
duckdb $DUCKDB_LOCATION ".exit"

# Load data into DuckDB

# union_by_name is load-bearing, not tidiness. From 2026-09 the source dropped
# ten columns from the public export (titular name, Contribuinte, titular
# type/quality/country, telefone, fax, telemovel, email, Validade Seguro RC),
# so newer files have 17 columns where older ones have 27. Without it,
# read_csv_auto over the glob silently narrows every file to the smallest
# common schema -- no error, the historical columns just vanish and
# stg_al_list.sql then fails on names that no longer exist. With it, old files
# keep their values and rows from the newer exports get NULL.
duckdb -c  "
CREATE TABLE IF NOT EXISTS al_raw_data AS
SELECT * FROM read_csv_auto('$AL_DATA/*.csv.gz', header=True, union_by_name=true);
" "$DUCKDB_LOCATION"

# The Azorean regional register. Separate source, separate table: it has no
# registration dates, so it must never reach region_stats, and keeping it in its
# own table makes that structural rather than a rule someone has to remember.
#
# The filename carries the pull timestamp because the CSV itself has no date
# column to carry it. stg_azores_al.sql uses it to pick the newest snapshot.
duckdb -c "
CREATE TABLE IF NOT EXISTS azores_al_raw_data AS
SELECT
    *,
    filename AS source_file,
    strptime(
        regexp_extract(filename, 'azores_al_([0-9]{8}_[0-9]{6})', 1),
        '%Y%m%d_%H%M%S'
    ) AS etl_timestamp
FROM read_csv_auto(
    '$AZORES_DATA/azores_al_*.csv.gz', header=True, union_by_name=true, filename=true
);
" "$DUCKDB_LOCATION"

duckdb -c "
CREATE TABLE IF NOT EXISTS postal_codes_raw AS
SELECT * FROM read_csv_auto('$POSTAL_CODE_DATA/postal_codes_raw.csv.gz', header=True)
" "$DUCKDB_LOCATION"

gunzip -kf downloads/osm/admin.geojson.gz

export DBT_PROFILES_DIR=./config
export PYTHONPATH=`pwd`

dbt seed 
dbt run --select +postcodes_to_lookup
python scripts/lookup_invalid_postcodes.py

dbt run
echo "ETL process completed successfully."