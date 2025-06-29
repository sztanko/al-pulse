#!/bin/bash -e

echo "Exporting data to GeoJSON..."
./scripts/export_to_geojson.sh localities_with_data_for_geojson
cd reports
echo "Installing dependencies..."
npm install
echo "Generating sources..."
npm run sources
echo "Generating report..."
npm run build
echo "Report generation completed successfully."
