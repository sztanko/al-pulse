WITH points AS (
    SELECT
        postcode,
        district,
        municipality,
        ST_POINT(lng, lat)::GEOMETRY AS geom
    FROM {{ ref('postcodes') }}
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
    INNER JOIN {{ ref('admin') }} AS a
        ON ST_CONTAINS(a.geom, l.point_geom)
    INNER JOIN {{ ref('populated_areas') }} AS pa
        ON ST_CONTAINS(pa.geom, l.point_geom)
    WHERE a.is_leaf
),

-- Final clipped output
clipped AS (
    SELECT
        postcode,
        district,
        municipality,
        ST_INTERSECTION(geom, admin_geom) AS geom
    FROM with_municipality
)

SELECT * FROM clipped
