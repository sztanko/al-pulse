{{
    config(
        materialized='table',
        post_hook="CREATE INDEX IF NOT EXISTS idx_postcode_areas_geom ON {{ this }} USING RTREE(geom)",
    )
}}

WITH points AS (
    SELECT
        postcode,
        district,
        municipality,
        ST_POINT(lng, lat)::GEOMETRY AS geom
    FROM {{ ref('postcodes') }}
    WHERE is_valid IS TRUE
),

geom_collection AS (
    SELECT ST_COLLECT(LIST(geom)) AS geomset
    FROM points
),

voronoi_raw AS (
    SELECT ST_VORONOIDIAGRAM(geomset) AS voronoi_geom
    FROM geom_collection
),

exploded AS (
    SELECT unnest.geom
    FROM voronoi_raw,
        UNNEST(ST_DUMP(voronoi_raw.voronoi_geom)) AS unnest
),

labeled AS (
    SELECT
        p.postcode,
        p.district,
        p.municipality,
        e.geom,
        p.geom AS point_geom
    FROM exploded AS e
    INNER JOIN points AS p
        ON ST_CONTAINS(e.geom, p.geom)
),

-- Assign municipality by spatial containment
with_municipality AS (
    SELECT
        l.postcode,
        l.district,
        l.municipality,
        l.geom,
        a.geom AS admin_geom
    FROM labeled AS l
    INNER JOIN {{ ref("admin_split") }} AS a
        ON ST_INTERSECTS(l.geom, a.geom)
-- INNER JOIN {{ ref('populated_areas') }} AS pa
--     ON ST_CONTAINS(pa.geom, l.point_geom)
-- WHERE a.is_leaf
),

-- Final clipped output
with_all_admins AS (
    SELECT
        postcode,
        district,
        municipality,
        geom,
        ST_UNION_AGG(admin_geom) AS admin_geom_united
    FROM with_municipality
    GROUP BY postcode, district, municipality, geom
),

clipped AS (
    SELECT
        postcode,
        district,
        municipality,
        ST_INTERSECTION(geom, admin_geom_united) AS geom
        -- admin_geom
    FROM with_all_admins
)

SELECT * FROM clipped
-- where ST_AREA(geom) > 0
