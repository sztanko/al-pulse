#!/bin/bash
set -e

table_name=$1
if [ -z "$table_name" ]; then
  echo "Usage: $0 <table_name>"
  exit 1
fi

rm -f "$table_name.geojson"

duckdb data/prod.duckdb <<EOF
INSTALL spatial;
LOAD spatial;
COPY $table_name
TO '$table_name.geojson'
WITH (
    FORMAT gdal,
    DRIVER 'GeoJSON',
    SRS 'EPSG:4326'
);
EOF

./reports/node_modules/mapshaper/bin/mapshaper $table_name.geojson -simplify 0.05  -o reports/static/admin.geojson

echo "Done"
