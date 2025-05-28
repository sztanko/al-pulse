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

# extract admin boundaries
echo "Extracting admin boundaries from OSM data..."
# need to extract all admin, buildings, and roads data
osmium tags-filter $portugal_osm_data r/boundary=administrative -o "$OSM_DATA/admin.osm.pbf" --overwrite
osmium export "$OSM_DATA/admin.osm.pbf" -o "$OSM_DATA/admin.geojson" -f geojson --overwrite
rm "$OSM_DATA/admin.osm.pbf"


ogr2ogr -f GeoJSON -overwrite downloads/osm/buildings.geojson \
  -where "building = 'yes'" \
  -skipfailures \
  downloads/osm/portugal-latest.osm.pbf \
  multipolygons

ogr2ogr -f GeoJSON -overwrite downloads/osm/roads.geojson \
  -where "highway in ('secondary', 'tertiary', 'residential', 'unclassified', 'trunc')" \
  -skipfailures \
  downloads/osm/portugal-latest.osm.pbf \
  lines


# osmium tags-filter $portugal_osm_data w/highway=* -o "$OSM_DATA/roads.osm.pbf" --overwrite
#osmium export "$OSM_DATA/roads.osm.pbf" -o "$OSM_DATA/roads.geojson" -f geojson --overwrite
# rm "$OSM_DATA/roads.osm.pbf"
