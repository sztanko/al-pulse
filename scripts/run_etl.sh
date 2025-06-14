#!/bin/bash

DUCKDB_LOCATION="data/prod.duckdb"
INPUT_DIR="downloads"
AL_DATA="$INPUT_DIR/al"
POSTAL_CODE_DATA="$INPUT_DIR/postal_code"
echo "Running ETL process..."

rm $DUCKDB_LOCATION
duckdb $DUCKDB_LOCATION ".exit"

# Step 1: Fetch all the al list
# python scripts/fetch_al_list.py --output $AL_DATA
gzip -q $AL_DATA/*.csv

# Load data into DuckDB
# load all *csv.zip files from AL into al_raw_data table. Use header=True
# CREATE TABLE my_table AS
# SELECT * FROM read_csv_auto('path/to/*.csv.gz');

duckdb -c  "
CREATE TABLE IF NOT EXISTS al_raw_data AS
SELECT * FROM read_csv_auto('$AL_DATA/*.csv.gz', header=True);
" "$DUCKDB_LOCATION"

duckdb -c "
CREATE TABLE IF NOT EXISTS postal_codes_raw AS
SELECT * FROM read_csv_auto('$POSTAL_CODE_DATA/postal_codes_raw.csv.gz', header=True)
" "$DUCKDB_LOCATION"

gunzip -kf downloads/osm/admin.geojson.gz

dbt seed && dbt run
python scripts/lookup_invalid_postcodes.py
dbt seed && dbt run
