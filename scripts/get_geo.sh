#!/bin/bash -e
# This is a one off, manual script to download the OSM data for Portugal and create the admin shapefiles.
INPUT_DIR="downloads"
OSM_DATA="$INPUT_DIR/osm"
osm_file_name="portugal-latest.osm.pbf"
portugal_osm_data="$OSM_DATA/$osm_file_name"

if [ ! -d "$OSM_DATA" ]; then
  mkdir -p "$OSM_DATA"
fi
if [ ! -f "$portugal_osm_data" ]; then
  echo "Downloading OSM data for Portugal..."
  wget -q "https://download.geofabrik.de/europe/portugal-latest.osm.pbf" -O "$portugal_osm_data"
  if [ $? -ne 0 ]; then
    echo "Failed to download OSM data."
    exit 1
  fi
else
  echo "OSM data for Portugal already exists at $portugal_osm_data."
fi

pip install -r requirements.txt

python scripts/create_admin_shapefiles.py downloads/osm/portugal-latest.osm.pbf --output downloads/osm/admin.geojson
rm -f downloads/osm/admin.geojson.gz
gzip -9 downloads/osm/admin.geojson