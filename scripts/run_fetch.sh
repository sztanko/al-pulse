#!/bin/bash -e

INPUT_DIR="downloads"
AL_DATA="$INPUT_DIR/al"
POSTAL_CODE_DATA="$INPUT_DIR/postal_code"
echo "Running fetch..."

pip install -r requirements.txt

# Step 1: Fetch all the al list
python scripts/fetch_al_list.py # --output $AL_DATA
gzip -q $AL_DATA/*.csv

echo "Data fetched and compressed successfully. to $AL_DATA"

# Step 2: Fetch the Azorean regional register.
#
# Four HTTP requests and a few seconds, against a different source entirely:
# the Azores are an autonomous region and their AL register is regional, so the
# national export carries only a few hundred of the ~4,500 establishments
# there. The script writes its own gzipped CSV and refuses to write one that
# fails its gates, so a bad pull leaves the previous month in place.
AZORES_DATA="$INPUT_DIR/azores"
python scripts/fetch_azores.py
echo "Azores register fetched to $AZORES_DATA"