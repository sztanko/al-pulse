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