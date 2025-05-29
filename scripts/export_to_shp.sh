#!/bin/bash
set -e

table_name=$1
if [ -z "$table_name" ]; then
  echo "Usage: $0 <table_name>"
  exit 1
fi

rm -f "$table_name".{shp,shx,dbf,prj}

duckdb data/prod.duckdb <<EOF
LOAD spatial;
COPY $table_name
TO '$table_name.shp'
WITH (
    FORMAT gdal,
    DRIVER 'ESRI Shapefile',
    SRS 'EPSG:4326'
);
EOF

echo "Done"
