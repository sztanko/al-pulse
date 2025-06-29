#!/bin/bash -e

./scripts/export_to_geojson.sh localities_with_data_for_geojson
cd reports
npm install
npm run build
