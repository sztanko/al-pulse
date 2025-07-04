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