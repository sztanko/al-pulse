# Definition

Analysis of Portuguese AL (Alojamento Local) data. Focus on historical growth, spatial distribution, top 10 X (e.g. most growing postcodes/freguesias, places where AL is wlosing down, etc.), and comparison with census data. We need to see how many AL-s per 1000 residents are there, etc.

## Sources
- Portugal OSM: https://download.geofabrik.de/europe/portugal-latest.osm.pbf - here is a tutorial: https://towardsdatascience.com/how-to-read-osm-data-with-duckdb-ffeb15197390/
- postcode data: https://raw.githubusercontent.com/temospena/CP7/refs/heads/master/CP7%20Portugal/CP7_Portugal_nov2022.txt
- census data: https://www.ine.pt/ine/json_indicador/pindica.jsp?op=2&lang=PT&varcd=0011609
- al data: https://rnt.turismodeportugal.pt/RNT/Pesquisa_AL.aspx

## Tools

Duckdb for data storage, Evidence.dev for data visualization, python for ETL. Consider using DBT for models.

## Actions

### Build base data

- postcode areas
  - voronoi polygons of postcodes
  - intersect with
    - frequesia boundaries
    - buffer roads, residential areas, and buildings
      - buffer + 100m, then -50m (which means we need to find a good projection for the data. Remember, this also includes Azoresa and Madeira, so we need to use a projection that works well for the whole country)
        - EPSG:3763 for mainland Portugal, but also for Azores and Madeira. Just for reference, there are usland specific projections, which we won't use:
          - UTM zone 26N for Azores for Azores
          - UTM 28N for Madeira
  - 
- census data, get the data for 2021. For each freqguesia, get:
  - population
  - number of households
  - number of dwellings
  - number of abandoned buildings
  - population between 18 and 64
  - population over 65
