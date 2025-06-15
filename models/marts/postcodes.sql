{{
    config(
        materialized='table',
        post_hook='CREATE INDEX IF NOT EXISTS idx_postcode_areas_geom ON {{ this }} USING RTREE(geom)',
        pre_hook='DROP INDEX IF EXISTS idx_postcode_areas_geom'
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

with_localities_ranked AS (
    SELECT
        cwl.postcode,
        a.name AS locality,
        a.parent_name AS municipality,
        municipalities.parent_name AS district,
        a.osm_id AS locality_id,
        st_distance(cwl.geom, municipalities.geom) AS distance,
        row_number() OVER (
            PARTITION BY cwl.postcode
            ORDER BY st_distance(cwl.geom, municipalities.geom) DESC
        ) AS proximity_rank
    FROM with_localities AS cwl
    INNER JOIN {{ ref('admin') }} AS municipalities
        ON
            municipalities.admin_level = 7
            AND cwl.locality IS null
            AND st_contains(municipalities.geom, cwl.geom)
    INNER JOIN {{ ref('admin') }} AS a
        ON municipalities.osm_id = a.parent_id
    WHERE
        cwl.is_valid
        AND cwl.locality IS null
),

valid_postcodes_with_localities AS (
    SELECT DISTINCT ON (cwl.postcode)
        cwl.postcode,
        coalesce(cwl.locality, rl.locality) AS locality,
        coalesce(cwl.municipality, rl.municipality) AS municipality,
        coalesce(cwl.district, rl.district) AS district,
        cwl.lng,
        cwl.lat,
        cwl.is_valid,
        cwl.correction_type,
        cwl.real_postcode,
        cwl.geom
        -- rl.locality_id,
        -- rl.distance AS locality_distance
    FROM with_localities AS cwl
    LEFT JOIN with_localities_ranked AS rl
        ON cwl.postcode = rl.postcode
    WHERE rl.proximity_rank IS null OR rl.proximity_rank = 1
    ORDER BY cwl.postcode ASC, cwl.is_valid DESC, coalesce(cwl.locality, rl.locality) IS null, cwl.geom IS null

)

SELECT * FROM valid_postcodes_with_localities
