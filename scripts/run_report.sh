#!/bin/bash -e
#
# Build the static site from the DuckDB marts.
#
# Two steps, in this order:
#   1. export the marts to JSON payloads under site/data/ (build-time only,
#      never served) and the locality geometry to site/public/geo/;
#   2. build the Astro site, which reads those payloads and bakes the result
#      into HTML.
#
# Node 22 (see site/.nvmrc): the duckdb npm package only ships prebuilt
# binaries per Node ABI and the system default is newer than anything with
# prebuilds.

echo "Exporting locality geometry..."
./scripts/export_to_geojson.sh localities_with_data_for_geojson

echo "Exporting site payloads..."
python scripts/export_site_data.py

cd site

echo "Installing dependencies..."
npm ci --no-audit --no-fund 2>/dev/null || npm install --no-audit --no-fund

echo "Building site..."
# `npm run build` runs the theme-parity and type gates before astro build.
npm run build

echo "Site built to site/dist"
