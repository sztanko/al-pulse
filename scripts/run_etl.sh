#!/bin/bash -e

source ./scripts/constants.sh

echo "Running ETL process..."

rm -f $DUCKDB_LOCATION
mkdir -p "$(dirname "$DUCKDB_LOCATION")"
duckdb $DUCKDB_LOCATION ".exit"

# Load data into DuckDB

duckdb -c  "
CREATE TABLE IF NOT EXISTS al_raw_data AS
SELECT * FROM read_csv_auto('$AL_DATA/*.csv.gz', header=True);
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