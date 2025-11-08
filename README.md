# AL Pulse

An open-source geospatial data analysis project tracking Portuguese Alojamento Local (AL) accommodation listings across Portugal. This project analyzes historical growth, spatial distribution, and demographic impacts of short-term rental properties using modern data engineering tools.

## Live Reports

View the interactive reports at: [https://your-username.github.io/al-pulse](https://your-username.github.io/al-pulse) *(update with your actual GitHub Pages URL)*

## What It Does

AL Pulse provides:

- **Historical Analysis**: Track AL listing growth from 2007 to present across Portugal
- **Geographic Insights**: Visualize AL distribution at country, district, municipality, and locality (freguesia) levels
- **Demographic Context**: Calculate AL density per capita and analyze impacts on local communities
- **Growth Tracking**: Identify fastest-growing and declining areas
- **Property Analytics**: Analyze room counts, building ages, and property types
- **Interactive Maps**: Explore geospatial data through Evidence.dev visualizations

The project focuses on mainland Portugal and Madeira (Azores data is excluded due to infrequent updates).

## Architecture

- **Data Storage**: DuckDB with spatial extension
- **Data Modeling**: DBT (staging → intermediate → marts layers)
- **Visualization**: Evidence.dev for interactive reports
- **ETL**: Python scripts with Playwright for web scraping
- **Deployment**: GitHub Pages (automated via GitHub Actions)

## Data Sources

- **AL Listings**: [Turismo de Portugal RNT](https://rnt.turismodeportugal.pt/RNT/Pesquisa_AL.aspx)
- **Administrative Boundaries**: [OpenStreetMap](https://download.geofabrik.de/europe/portugal-latest.osm.pbf)
- **Postal Codes**: [CP7 Portugal](https://github.com/temospena/CP7)
- **Census Data**: [INE Portugal](https://www.ine.pt/)

All raw data is stored in compressed CSV format in the repository and processed through DBT models to create structured datasets.

## Development Setup

### Prerequisites

- Python 3.13+
- DuckDB 1.1.3+
- Node.js 22+
- Playwright (for web scraping)

### Installation

```bash
# Install Python dependencies
pip install -r requirements.txt

# Install Playwright browsers
playwright install webkit

# Install Evidence.dev dependencies
cd reports
npm install
cd ..
```

### Running the Pipeline

```bash
# 1. Load and process data (using existing CSV files)
./scripts/run_etl.sh

# 2. Generate reports
./scripts/run_report.sh

# 3. View reports locally
cd reports
npm run dev
```

## Monthly Data Updates

This project requires manual data updates on the 1st of each month.

### Update Process

Run the monthly update script:

```bash
./scripts/monthly_data_refresh.sh
```

This script will:
1. Fetch new AL data (~1 hour runtime)
2. Process data through the ETL pipeline
3. Stage changes to git
4. Prompt for confirmation
5. Commit and push to GitHub

Once pushed, GitHub Actions automatically:
- Runs the full ETL pipeline
- Builds Evidence.dev reports
- Deploys to GitHub Pages

### Set Up Monthly Reminders

**macOS/Linux Calendar Notification:**

Add to crontab (`crontab -e`):
```bash
0 9 1 * * /usr/bin/osascript -e 'display notification "Run monthly AL data refresh" with title "AL Pulse"'
```

**Manual Calendar Event:**

Create a recurring monthly calendar event on the 1st to run `./scripts/monthly_data_refresh.sh`

## Project Structure

```
├── data/                      # DuckDB database (not committed)
├── downloads/                 # Raw data (CSV.gz files, committed)
│   ├── al/                   # AL listing data
│   ├── postal_code/          # Postal code data
│   └── osm/                  # OSM boundaries
├── models/                    # DBT models
│   ├── staging/              # Initial data cleaning
│   ├── intermediate/         # Complex transformations
│   └── marts/                # Final analysis tables
├── reports/                   # Evidence.dev reports
│   ├── pages/                # Report pages (index, areas, map)
│   └── sources/              # Data source definitions
├── scripts/                   # ETL and utility scripts
└── .github/workflows/        # GitHub Actions
```

## Key Commands

```bash
# DBT operations
dbt seed                      # Load seed data
dbt run                       # Run all models
dbt test                      # Run data quality tests
dbt run --select <model>      # Run specific model

# Evidence.dev operations
cd reports
npm run sources               # Regenerate data sources
npm run dev                   # Development server
npm run build                 # Production build

# Database access
duckdb data/prod.duckdb       # Connect to database
```

## Configuration

- `dbt_project.yml`: DBT configuration and materialization strategies
- `config/profiles.yml`: DuckDB connection with spatial extension
- `reports/evidence.config.yaml`: Evidence.dev theming and deployment settings
- `CLAUDE.md`: AI assistant guidance for working with this codebase

## Contributing

This is an open-source project. Contributions are welcome! The data and code are freely available for analysis and research.

### Development Notes

- Use EPSG:3763 projection for all spatial operations
- Follow DBT best practices: staging → intermediate → marts
- Avoid complex SQL in reports; create DBT models instead
- Use descriptive names for models and fields
- Use `typer` for Python CLI scripts

## References

- Official AL mapping: [Turismo de Portugal Open Data](https://dadosabertos.turismodeportugal.pt/datasets/4e62eb1977564991bd01e61d7aa8266f_6/explore)
- DBT Documentation: [docs.getdbt.com](https://docs.getdbt.com)
- Evidence.dev Documentation: [docs.evidence.dev](https://docs.evidence.dev)
- DuckDB Spatial: [duckdb.org/docs/extensions/spatial](https://duckdb.org/docs/extensions/spatial)
