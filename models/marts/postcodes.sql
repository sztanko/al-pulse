{{
    config(
        materialized='table',
        post_hook='CREATE INDEX IF NOT EXISTS idx_postcode_areas_geom ON {{ this }} USING RTREE(geom)',
        pre_hook='DROP INDEX IF EXISTS idx_postcode_areas_geom'
    )
}}

WITH valid_postcodes_all AS (
    SELECT DISTINCT
        postcode,
        -- title,
        district,
        municipality,
        lat,
        lng
    FROM {{ ref('stg_postal_code_lookup') }}
    WHERE
        postcode = query_postcode
        AND lat IS NOT null
    UNION
    SELECT DISTINCT
        cp7 AS postcode,
        -- lower(cp_alpha) AS title,
        district,
        municipality,
        lat,
        lng
    FROM {{ ref('stg_postal_codes_raw') }}
),

postcodes_with_num AS (
    SELECT
        *,
        (substring(postcode, 1, 4) || substring(postcode, 6, 4))::int AS postcode_num,
        row_number() OVER (
            PARTITION BY postcode
            ORDER BY length(lat::text) + length(lng::text) DESC
        ) AS rn
    FROM valid_postcodes_all
),

valid_postcodes AS (
    SELECT * FROM postcodes_with_num
    WHERE rn = 1
),

invalid_postcodes AS (
    SELECT
        CASE
            WHEN postal_code IS null THEN '0000-000'
            WHEN postal_code ~ '^\d{4}-\d{3}$' THEN postal_code
            WHEN postal_code ~ '^\d{4}-\d{2}$' THEN concat(postal_code, '0')
            WHEN postal_code ~ '^\d{4}$' THEN concat(postal_code, '-000')
            WHEN postal_code ~ '^\d{3}$' THEN concat(postal_code, '0-000')
            WHEN postal_code ~ '^\d{3}-\d{3}$' THEN concat('0', substring(postal_code, 1, 3), '-000')
            WHEN postal_code ~ '^\d{2}-\d{3}$' THEN concat('00', substring(postal_code, 1, 2), '-000')
            WHEN postal_code ~ '^\d{1}-\d{3}$' THEN concat('000', substring(postal_code, 1, 1), '-000')
            WHEN postal_code ~ '^\d{5}$' THEN concat(substring(postal_code, 1, 4), '-000')
            -- handle cases like postcode=3660-692,3660-692,3660-692,3660-692 - then take the first part
            WHEN postal_code ~ '^\d{4}-\d{3},.*$' THEN substring(postal_code, 1, 8)
            ELSE postal_code
        END AS postcode,

        -- (substring(postal_code, 1, 4) || substring(postal_code, 6, 4))::int AS postcode_num,
        district,
        municipality,
        -- locality,
        count(*) AS num_properties
    FROM {{ ref('stg_al_list') }} AS al
    WHERE
        NOT EXISTS (
            SELECT 1
            FROM valid_postcodes AS p
            WHERE al.postal_code = p.postcode
        )
    GROUP BY 1, 2, 3
    ORDER BY 1, 4 DESC
),

invalid_postcodes_with_num AS (
    SELECT
        *,
        (substring(postcode, 1, 4) || substring(postcode, 6, 4))::int AS postcode_num
    FROM invalid_postcodes
),

invalid_postcodes_with_closest_neighbours_distict AS (
    SELECT
        ip.postcode,
        ip.municipality,
        ip.district,
        ip.postcode_num,
        vp.postcode AS closest_valid_postcode,
        abs(ip.postcode_num - vp.postcode_num) AS distance
    FROM invalid_postcodes_with_num AS ip
    INNER JOIN valid_postcodes AS vp
        ON
            ip.municipality = vp.municipality
            AND ip.district = vp.district
    QUALIFY row_number() OVER (
        PARTITION BY ip.postcode
        ORDER BY abs(ip.postcode_num - vp.postcode_num)
    ) = 1
),

invalid_postcodes_with_closest_neighbours_municipality AS (
    SELECT
        ip.postcode,
        ip.municipality,
        ip.district,
        ip.postcode_num,
        vp.postcode AS closest_valid_postcode,
        abs(ip.postcode_num - vp.postcode_num) AS distance
    FROM invalid_postcodes_with_num AS ip
    INNER JOIN valid_postcodes AS vp
        ON
            ip.municipality = vp.municipality
    QUALIFY row_number() OVER (
        PARTITION BY ip.postcode
        ORDER BY abs(ip.postcode_num - vp.postcode_num)
    ) = 1
),

invalid_postcodes_with_closest_neighbours AS (
    SELECT
        ip.postcode,
        ip.municipality,
        ip.district,
        ip.postcode_num,
        vp.postcode AS closest_valid_postcode,
        abs(ip.postcode_num - vp.postcode_num) AS distance
    FROM invalid_postcodes_with_num AS ip,
        valid_postcodes AS vp
    QUALIFY row_number() OVER (
        PARTITION BY ip.postcode
        ORDER BY abs(ip.postcode_num - vp.postcode_num)
    ) = 1
),

invalid_postcodes_match AS (
    SELECT
        ip.*,
        coalesce(
            cnd.closest_valid_postcode,
            cnm.closest_valid_postcode,
            cn.closest_valid_postcode
        ) AS closest_valid_postcode,
        coalesce(
            cnd.distance,
            cnm.distance,
            cn.distance
        ) AS distance,
        CASE
            WHEN cnd.closest_valid_postcode IS NOT null THEN 'district'
            WHEN cnm.closest_valid_postcode IS NOT null THEN 'municipality'
            ELSE 'all'
        END AS closest_valid_postcode_type
    FROM invalid_postcodes_with_num AS ip
    LEFT JOIN invalid_postcodes_with_closest_neighbours_distict AS cnd
        ON ip.postcode = cnd.postcode
    LEFT JOIN invalid_postcodes_with_closest_neighbours_municipality AS cnm
        ON ip.postcode = cnm.postcode
    LEFT JOIN invalid_postcodes_with_closest_neighbours AS cn
        ON ip.postcode = cn.postcode
),

combined_result AS (
    SELECT
        postcode,
        district,
        municipality,
        lng,
        lat,
        true AS is_valid,
        'exact' AS match_type,
        postcode AS real_postcode
    FROM valid_postcodes
    UNION
    SELECT
        ip.postcode,
        ip.district,
        ip.municipality,
        vp.lng,
        vp.lat,
        false AS is_valid,
        closest_valid_postcode_type AS match_type,
        closest_valid_postcode AS real_postcode
    FROM invalid_postcodes_match AS ip
    LEFT JOIN valid_postcodes AS vp
        ON ip.closest_valid_postcode = vp.postcode
    WHERE ip.closest_valid_postcode IS NOT null
)

SELECT
    *,
    st_point(lng, lat)::geometry AS geom
FROM combined_result
