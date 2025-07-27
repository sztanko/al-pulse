# Definition

Analysis of Portuguese AL (Alojamento Local) data. Focus on historical growth, spatial distribution, top 10 X (e.g. most growing postcodes/freguesias, places where AL is wlosing down, etc.), and comparison with census data. We need to see how many AL-s per 1000 residents are there, etc.

## Sources
- Portugal OSM: https://download.geofabrik.de/europe/portugal-latest.osm.pbf - here is a tutorial: https://towardsdatascience.com/how-to-read-osm-data-with-duckdb-ffeb15197390/
- admin areas: https://dados.gov.pt/en/datasets/distritos-de-portugal/ and https://dados.gov.pt/en/datasets/freguesias-de-portugal/ 
- postcode data: https://raw.githubusercontent.com/temospena/CP7/refs/heads/master/CP7%20Portugal/CP7_Portugal_nov2022.txt
- census data: https://www.ine.pt/ine/json_indicador/pindica.jsp?op=2&lang=PT&varcd=0011609
- al data: https://rnt.turismodeportugal.pt/RNT/Pesquisa_AL.aspx
  - al data for azores: https://www.azores.gov.pt/NR/rdonlyres/F5B6CDB9-24D1-4EE9-8AB2-1D5B141A21DE/0/ALDRT27022018smg.pdf
  - see info: https://portal.azores.gov.pt/web/drturismo/alojamento-local
  - https://www.azores.gov.pt/Portal/pt/entidades/sreat-drturismo/livres/aloj-local3.htm - list of ALs in Azores, found here: https://business.turismodeportugal.pt/SiteCollectionDocuments/alojamento-local/guia-alojamento-local-jan-2025.pdf?

Btw, nice AL mapping visualization: https://dadosabertos.turismodeportugal.pt/datasets/4e62eb1977564991bd01e61d7aa8266f_6/explore?location=39.567599%2C-8.411836%2C12.89
https://dadosabertos.turismodeportugal.pt/datasets/4e62eb1977564991bd01e61d7aa8266f_6/explore?location=38.706161%2C-8.988947%2C14.03
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


# Notes

https://rnt.turismodeportugal.pt/RNT/RNAL.aspx?nr=24477 - this one doesn't load, because it is from 2005