{{
    config(
        materialized='table',
        pre_hook=[
            "DROP INDEX IF EXISTS idx_postcode_areas_geom"
        ],
        post_hook='CREATE INDEX IF NOT EXISTS idx_with_localities_geom ON {{ this }} USING RTREE(geom)'
        
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
        '_exact' AS correction_type,
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

combined_result_distinct AS (
    SELECT DISTINCT ON (cr.postcode)
        cr.postcode,
        cr.district,
        cr.municipality,
        cr.lng,
        cr.lat,
        cr.is_valid,
        cr.correction_type,
        cr.real_postcode
    FROM combined_result AS cr
    ORDER BY cr.postcode ASC, cr.is_valid DESC, cr.correction_type ASC
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
    FROM combined_result_distinct AS cr
    LEFT JOIN combined_result_distinct AS rp
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
)

SELECT *
-- ,st_point(0, 0)::geometry AS geom
FROM with_localities
