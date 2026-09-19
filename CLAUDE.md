# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a geospatial data analysis project focused on Portuguese AL (Alojamento Local) data. The project analyzes historical growth, spatial distribution, and demographics of accommodation listings across Portugal using DBT for data modeling, DuckDB for storage, Evidence.dev for visualization, and Python for ETL processes.

## Core Architecture

### Data Pipeline Architecture
- **Raw Data Sources**: AL listings, OSM admin boundaries, postal codes, census data
- **Storage**: DuckDB database (`data/prod.duckdb`) with spatial extension
- **Processing**: DBT models organized in staging → intermediate → marts layers  
- **Visualization**: a bespoke static site in `site/` (Astro + React islands, hand-rolled SVG/canvas)
- **ETL**: Python scripts for data fetching and processing

### DBT Model Structure
- **Staging** (`models/staging/`): Ephemeral models for initial data cleaning
- **Intermediate** (`models/intermediate/`): Ephemeral models for complex transformations, especially postcode processing
- **Marts** (`models/marts/`): Final materialized tables for analysis and reporting

Key marts include:
- `al.sql`: Clean AL listing data
- `region_stats_per_metric.sql`: Aggregated statistics by area and metric
- `localities_with_data_for_geojson.sql`: Geospatial data for mapping

## Best practices

- Do not create complex sql in the reports, as it will be hard to maintain. Instead, create a dbt model and refer to it in the report.
- Use descriptive names for models and fields to ensure clarity
- For python scripts, use `typer` as the CLI framework for better usability
- also make sure the python logic is split in functions with well defined responsibilities

## Essential Commands

### Data Pipeline
```bash
# Full ETL pipeline (fetch → process → build reports)
./scripts/run_fetch.sh    # Fetch raw AL data from external APIs
./scripts/run_etl.sh      # Process data through DBT pipeline 
./scripts/run_report.sh   # Generate Evidence.dev reports

# Individual pipeline steps
dbt seed                  # Load seed data
dbt run                   # Run all models
dbt test                  # Run data quality tests
```

### The site
```bash
./scripts/run_report.sh   # geometry + payloads + gated build  → site/dist
cd site
npm run dev               # development server
npm run verify            # browser checks against the built output
```

`npm run build` runs two gates before Astro: `check:theme` (the dark palette is
declared twice and the copies must match) and `astro check`.

The site is built from JSON payloads, not from a live query layer. To expose a
new mart to it, add a query to `scripts/export_site_data.py` and a typed
accessor in `site/src/lib/data.ts`. Payloads land in `site/data/` (build-time
only, never served); a page reads them during `astro build` and passes an
island only the rows it draws.

Design rules for anything added here are in
`/home/dimi/workspace/docs/dataviz-principles.md`, and the Evidence → bespoke
feature contract is `site/FEATURE_PARITY.md`.



Pages:
- `index.astro` — national overview
- `areas/[slug].astro` — one page per area (2,779 of them)
- `areas/index.astro` — searchable index of every area
- `map.astro` — canvas choropleth of all localities
- `method.astro` — how the figures are made and what they cannot tell you

### DuckDB Operations
```bash
# Connect to database
duckdb data/prod.duckdb

# Database configured with spatial extension in config/profiles.yml
# Memory limit: 6GB, temp directory: /tmp
```

## Key Configuration Files

- `dbt_project.yml`: DBT configuration with materialization strategies and variables for metrics
- `config/profiles.yml`: DuckDB connection with spatial extension
- `site/astro.config.mjs`: base path `/al-pulse` for GitHub Pages
- `scripts/constants.sh`: Environment variables for data paths

## Data Model

### Extraction of data

Data is scraped using the `scripts/run_fetch.sh` script, which fetches AL data from external APIs and stores it csv that we compress and the store in Github.  Once a month, we refresh this data by running the script that re-fetches the data. Then we load it into duckdb, apply all the transformations, but that all is derived data and is not commited. It is only used to generate the reports. Reports then are served using github pages. This is an Open Source project, so the data is available for anyone to use.

There is no field in the source indicating that a property is not active anymore, We can only compare the data with the previous month and see which properties are not there anymore. This is why we fully re-fetch the data every month, to keep it up to date. It takes around an hour to do so and we want to make sure we do not overload the source servers, so we put some time.sleep() in the script.

Geographical boundaries and postal code data is fetched once. All those scripts dealing with it, calculating hierarhchies, etc are not really used anymore, as the datasets they have generated are not changed anymore,

in the DuckDB database. The data is then processed through DBT models to create a structured dataset for analysis.

The data we fetch is mostly Alojamento Local (AL) data, which includes information about accommodation listings in Portugal. The data is stored in a DuckDB database and processed through DBT models to create a structured dataset for analysis.
You can see all the data we receive about it in here: models/staging/stg_al_list.sql
### The Azores come from a second, separate register

The national export (RNAL) carries only ~320 Azorean establishments against the
~4,500 that exist, because tourism is a regional competence and Azorean
operators register with the Direção Regional do Turismo instead. The old note
here said their data "is not really updated" — that was the wrong diagnosis.
RNAL *is* updated for the Azores; it is simply the wrong register.

`scripts/fetch_azores.py` pulls the regional one from the WMS service behind the
dados.gov.pt dataset "Alojamento Local em funcionamento na RAA" (CC-BY). Things
to know before touching it:

- **It has no dates.** No registration date, no opening date. So Azorean data
  must never reach `region_stats` or anything derived from it: no series, no
  growth, no ranks, no losses. `area_summary.has_time_series` carries the
  distinction and `tests/azores_stay_out_of_the_time_series.sql` enforces it.
  The site marks every affected figure with an asterisk (`AzoresNote.astro`).
- **GetFeatureInfo returns only what is under the queried pixel.** A single
  probe looks like a complete pull and is not — it returns the central island
  group and one row for São Miguel. The fetcher tiles a 2x2 grid and asserts
  the union is larger than any one tile.
- **The raw pull holds personal data** (operator name, e-mail, phone). It is
  gitignored; only the cleansed CSV is committed, and
  `tests/azores_carries_no_personal_data.sql` fails the build if those columns
  ever reappear.
- **Records are placed by coordinate, not by name.** The register's freguesia
  spellings disagree with OSM for 47% of rows; point-in-polygon against `admin`
  resolves 99.4%. Name matching is only a fallback. See `models/marts/azores_al.sql`.

`downloads/azores/*.report.json` records what every cleansing rule did to that
month's pull, and `azores_data_quality` is the same thing as a queryable mart.


The project implements a dimensional model for time-series analysis:
- **Dimensions**: year_month, area_type, area_id, metric_name
- **Metrics**: AL count, room statistics, building age, property types. We also calculate rankings within municipalities, regions and countrywide. We also calculate the number of inhabitants per AL listing.
- **Geographic Levels**: Locality (parish or freguesia), Municipality, District, Country (Regions and Autonomous Regions count as Districts)

## Geospatial Processing

- **Projection**: EPSG:3763 for mainland Portugal, Azores, and Madeira
- **Admin Boundaries**: OSM data processed into GeoJSON format
- **Postal Code Areas**: Voronoi polygons intersected with administrative boundaries
- **Export Formats**: GeoJSON, Shapefile, GeoParquet


## Python Dependencies

Key packages in `requirements.txt`:
- Data processing: pandas, geopandas, requests
- Geospatial: shapely, pyproj
- Database: duckdb

## Development Workflow

1. Modify DBT models in appropriate layer (staging/intermediate/marts)
2. Run `dbt run --select <model_name>` to test individual models
3. Use `dbt test` to validate data quality
4. Update the site in `site/src/pages/`
5. Build with `./scripts/run_report.sh`, then `npm run verify` in `site/`

## Important Notes

- The project handles Portuguese geographic data including mainland, Azores, and Madeira
- All spatial operations use EPSG:3763 projection
- Large datasets are compressed (gzip) and processed incrementally
- Evidence.dev reports are configured for deployment at `/al-pulse` base path, because we host them on GitHub Pages