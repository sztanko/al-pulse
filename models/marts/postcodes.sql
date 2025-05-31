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

final AS (
    SELECT
        *,
        st_point(lng, lat)::geometry AS geom
    FROM combined_result
)

SELECT * FROM final
