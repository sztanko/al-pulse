#!/bin/bash -e
#
# Build the static site from the DuckDB marts.
#
# Order matters, and it is not the obvious one. The geometry export simplifies
# with mapshaper, which lives in site/node_modules — so dependencies have to be
# installed *first*. Exporting before installing works on a machine that has
# built before and fails on a clean checkout, which is exactly the shape of bug
# that only shows up in CI.
#
#   1. install site dependencies          (provides mapshaper)
#   2. export locality geometry           -> site/public/geo   (served)
#   3. export the district drawings       -> site/public/geo   (served)
#   4. export the JSON payloads           -> site/data         (build-time only)
#   5. build                               -> site/dist
#
# Node 22 (see site/.nvmrc): the duckdb npm package only ships prebuilt
# binaries per Node ABI and the system default is newer than anything with
# prebuilds.

echo "Installing site dependencies..."
if [ -f site/package-lock.json ]; then
  npm --prefix site ci --no-audit --no-fund
else
  npm --prefix site install --no-audit --no-fund
fi

echo "Exporting locality geometry..."
./scripts/export_to_geojson.sh localities_with_data_for_geojson

echo "Exporting district drawings..."
python scripts/export_district_art.py

echo "Exporting site payloads..."
python scripts/export_site_data.py

echo "Building site..."
# `npm run build` runs the theme-parity and type gates before astro build.
npm --prefix site run build

echo "Site built to site/dist"
