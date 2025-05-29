{{ config(
    materialized='view',
    
) }}

WITH features AS (
    SELECT geom FROM st_read({{ source("geojson", "buildings") }})
    UNION ALL
    SELECT geom FROM st_read({{ source("geojson", "roads") }})
    WHERE highway IN ('secondary', 'tertiary', 'residential', 'unclassified', 'trunc')
),

projected AS (
    SELECT st_transform(geom, 'EPSG:4326', 'EPSG:3763') AS geom_3763
    FROM features
),

unioned AS (
    SELECT st_union_agg(geom_3763) AS unified_geom
    FROM projected
),

buffered AS (
    SELECT st_buffer(st_buffer(unified_geom, 130), -100) AS buffered_geom
    FROM unioned
),

reprojected AS (
    SELECT st_transform(buffered_geom, 'EPSG:3763', 'EPSG:4326') AS geom
    FROM buffered
),

with_geom AS (
    SELECT unnest(st_dump(geom), recursive := true) AS geom
    FROM reprojected
)

SELECT geom
-- st_area_spheroid(geom.geom) AS area
FROM with_geom
