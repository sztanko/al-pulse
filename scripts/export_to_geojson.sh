#!/bin/bash
set -e

# Export a spatial table to GeoJSON and simplify it for the web.
#
# Output goes to site/public/geo/, which the map island fetches at runtime —
# it is the one payload too large to inline as island props.

table_name=$1
if [ -z "$table_name" ]; then
  echo "Usage: $0 <table_name>"
  exit 1
fi

OUT_DIR="site/public/geo"
OUT="$OUT_DIR/localities.json"
TMP="$table_name.geojson"

rm -f "$TMP"
mkdir -p "$OUT_DIR"

# -bail, because the duckdb CLI exits 0 after a failed statement in a
# heredoc. Without it a COPY that errors — GDAL refusing a column type, say —
# leaves the *previous* localities.json in place, and every check below then
# passes against last week's map. That happened: a HUGEINT population made the
# export fail while the script reported success and the site kept serving a
# file with 151 localities missing from it.
duckdb -bail data/prod.duckdb <<EOF
INSTALL spatial;
LOAD spatial;
COPY $table_name
TO '$TMP'
WITH (
    FORMAT gdal,
    DRIVER 'GeoJSON',
    SRS 'EPSG:4326'
);
EOF

if [ ! -s "$TMP" ]; then
  echo "ERROR: the COPY produced no $TMP — see the duckdb output above" >&2
  exit 1
fi

# mapshaper lives in site/node_modules. Call its binary directly rather than
# through npx: an `npx ... || npx ...` fallback previously let this script exit
# 0 having produced nothing at all, because the `||` swallowed the failure.
MAPSHAPER="site/node_modules/.bin/mapshaper"
if [ ! -x "$MAPSHAPER" ]; then
  echo "ERROR: $MAPSHAPER not found — run 'npm install' in site/ first" >&2
  rm -f "$TMP"
  exit 1
fi

"$MAPSHAPER" "$TMP" -simplify 0.05 -o "$OUT"
rm -f "$TMP"

# Verify the artefact, not the command. A simplify that silently wrote nothing
# looks identical to one that worked until someone opens the map.
if [ ! -s "$OUT" ]; then
  echo "ERROR: $OUT is missing or empty after simplification" >&2
  exit 1
fi
FEATURES=$(grep -o '"type":"Feature"' "$OUT" | wc -l)
if [ "$FEATURES" -lt 1000 ]; then
  echo "ERROR: $OUT holds only $FEATURES features; expected thousands" >&2
  exit 1
fi

# Against the table, not a constant. A fixed floor of 1,000 would not have
# noticed 2,471 features where the table held 2,622.
ROWS=$(duckdb -bail -noheader -list data/prod.duckdb "SELECT count(*) FROM $table_name;")
if [ "$FEATURES" -ne "$ROWS" ]; then
  echo "ERROR: $OUT holds $FEATURES features but $table_name has $ROWS rows" >&2
  exit 1
fi
echo "Wrote $OUT ($(du -h "$OUT" | cut -f1), $FEATURES features)"
