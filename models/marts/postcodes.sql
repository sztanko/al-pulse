{{
    config(
        materialized='table',
        pre_hook=[
            "DROP INDEX IF EXISTS idx_postcode_areas_geom",
            "SET preserve_insertion_order = FALSE",
            "PRAGMA max_temp_directory_size = '40GB'"
        ],
        post_hook='CREATE INDEX IF NOT EXISTS idx_postcode_areas_geom ON {{ this }} USING RTREE(geom)'
        
    )
}}

WITH
valid_postcodes AS (
    SELECT * FROM {{ ref('clean_postcodes_all') }}

),

invalid_postcodes AS (
    SELECT * FROM {{ ref('invalid_postcodes_lookup') }}
),

combined_result AS (
    SELECT
        postcode,
        district,
        municipality,
        lng,
        lat,
        true AS is_valid,
        'exact' AS correction_type,
        postcode AS real_postcode
    FROM valid_postcodes
    UNION
    SELECT
        ip.postcode,
        vp.district,
        vp.municipality,
        vp.lng,
        vp.lat,
        false AS is_valid,
        correction_type,
        alias_postcode AS real_postcode
    FROM invalid_postcodes AS ip
    LEFT JOIN valid_postcodes AS vp
        ON ip.postcode = vp.postcode
    WHERE ip.postcode IS NOT null
),

clean_without_localities AS (
    SELECT
        cr.postcode,
        capitalize(coalesce(cr.district, rp.district)) AS district,
        capitalize(coalesce(cr.municipality, rp.municipality)) AS municipality,
        coalesce(cr.lng, rp.lng) AS lng,
        coalesce(cr.lat, rp.lat) AS lat,
        cr.is_valid,
        cr.correction_type,
        cr.real_postcode,
        st_point(rp.lng, rp.lat)::geometry AS geom
    FROM combined_result AS cr
    LEFT JOIN combined_result AS rp
        ON cr.real_postcode = rp.postcode
),

with_localities AS (
    SELECT
        cwl.postcode,
        pl.locality,
        cwl.district,
        cwl.municipality,
        cwl.lng,
        cwl.lat,
        cwl.is_valid,
        cwl.correction_type,
        cwl.real_postcode,
        cwl.geom
    FROM clean_without_localities AS cwl
    LEFT JOIN {{ ref('postcode_localities') }} AS pl
        ON cwl.postcode = pl.postcode
    WHERE pl.locality IS NOT null
),

geomatching_all AS (
    SELECT
        cwl.postcode,
        localities.name AS locality,
        localities.osm_id AS locality_id,
        st_distance(cwl.geom, localities.geom) AS distance,
        row_number() OVER (
            PARTITION BY cwl.postcode
            ORDER BY st_distance(cwl.geom, localities.geom) DESC
        ) AS proximity_rank
    FROM with_localities AS cwl
    INNER JOIN {{ ref('admin') }} AS localities
        ON
            localities.admin_type = 'locality'
            AND st_contains(localities.geom, cwl.geom)
    WHERE
        cwl.is_valid
        AND cwl.geom IS NOT null
),

geomatching AS (
    SELECT * FROM geomatching_all
    WHERE proximity_rank = 1
),

name_matching AS (
    SELECT
        cwl.postcode,
        localities.name AS locality,
        localities.osm_id AS locality_id
    FROM with_localities AS cwl
    INNER JOIN {{ ref('admin') }} AS localities
        ON
            localities.admin_type = 'locality'
            AND lower(strip_accents(cwl.locality)) = lower(strip_accents(localities.name))
            AND lower(strip_accents(cwl.municipality)) = lower(strip_accents(localities.parent_name))
),

valid_postcodes_with_localities AS (
    SELECT DISTINCT ON (cwl.postcode)
        cwl.postcode,
        coalesce(nm.locality, rl.locality) AS locality,
        coalesce(nm.locality_id, rl.locality_id) AS locality_id,
        cwl.lng,
        cwl.lat,
        cwl.is_valid,
        cwl.correction_type,
        cwl.real_postcode,
        cwl.geom
        -- rl.locality_id,
        -- rl.distance AS locality_distance
    FROM with_localities AS cwl
    LEFT JOIN geomatching AS rl
        ON cwl.postcode = rl.postcode
    LEFT JOIN name_matching AS nm
        ON cwl.postcode = nm.postcode
    ORDER BY cwl.postcode ASC, cwl.is_valid DESC, coalesce(cwl.locality, rl.locality) IS null, cwl.geom IS null
),

with_muni_and_region AS (
    SELECT
        vpl.*,
        m.osm_id AS municipality_id,
        m.name AS municipality_name,
        r.osm_id AS region_id,
        r.name AS region_name
    FROM valid_postcodes_with_localities AS vpl
    LEFT JOIN {{ ref('admin') }} AS l
        ON
            l.admin_type = 'locality'
            AND vpl.locality_id = l.osm_id
    LEFT JOIN {{ ref('admin') }} AS m
        ON
            m.admin_type = 'municipality'
            AND l.parent_id = m.osm_id
    LEFT JOIN {{ ref('admin') }} AS r
        ON
            r.admin_type = 'region'
            AND m.parent_id = r.osm_id
)

SELECT * FROM with_muni_and_region
