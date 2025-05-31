WITH
postcodes_with_num AS (
    SELECT
        *,
        (substring(postcode, 1, 4) || substring(postcode, 6, 4))::int AS postcode_num,
        substring(postcode, 1, 2) AS cr4,
        row_number() OVER (
            PARTITION BY postcode
            ORDER BY length(lat::text) + length(lng::text) DESC
        ) AS rn
    FROM {{ ref("clean_postcodes_all") }}
),

valid_postcodes AS (
    SELECT * FROM postcodes_with_num
    WHERE rn = 1
),

all_postcodes_from_al AS (
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
    FROM {{ ref('stg_al_list') }}
    GROUP BY 1, 2, 3
    -- ORDER BY 1, 4 DESC
),

invalid_postcodes AS (
    SELECT al.*
    FROM all_postcodes_from_al AS al
    LEFT JOIN valid_postcodes AS vp
        ON al.postcode = vp.postcode
    WHERE
        vp.postcode IS null
),

invalid_postcodes_from_api AS (
    SELECT
        pl.postcode,
        pl.district,
        pl.municipality,
        num_properties
    FROM {{ ref('stg_postal_code_lookup') }} AS pl
    INNER JOIN invalid_postcodes AS ip
        ON pl.query_postcode = ip.postcode
    WHERE pl.query_postcode IN (
        SELECT postcode FROM invalid_postcodes
    )
    OR lng IS null
    OR lat IS null

),

invalid_postcodes_combined AS (
    SELECT * FROM invalid_postcodes
    UNION ALL
    SELECT * FROM invalid_postcodes_from_api
),

invalid_postcodes_with_num AS (
    SELECT
        *,
        (substring(postcode, 1, 4) || substring(postcode, 6, 4))::int AS postcode_num,
        substring(postcode, 1, 2) AS cr4
    FROM invalid_postcodes_combined
),

invalid_postcodes_with_closest_neighbours_district AS (
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
    FROM invalid_postcodes_with_num AS ip
    INNER JOIN valid_postcodes AS vp
        ON
            ip.cr4 = vp.cr4
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
    LEFT JOIN invalid_postcodes_with_closest_neighbours_district AS cnd
        ON ip.postcode = cnd.postcode
    LEFT JOIN invalid_postcodes_with_closest_neighbours_municipality AS cnm
        ON ip.postcode = cnm.postcode
    LEFT JOIN invalid_postcodes_with_closest_neighbours AS cn
        ON ip.postcode = cn.postcode
),

empty_postcodes_result AS (
    SELECT
        ip.postcode,
        -- ip.district,
        -- ip.municipality,
        -- vp.lng,
        -- vp.lat,
        closest_valid_postcode AS alias_postcode,
        closest_valid_postcode_type AS correction_type

    FROM invalid_postcodes_match AS ip
    LEFT JOIN valid_postcodes AS vp
        ON ip.closest_valid_postcode = vp.postcode
    WHERE ip.closest_valid_postcode IS NOT null
),

duplicate_postcodes AS (
    SELECT * FROM {{ ref('duplicate_postcode_lookup') }}
    WHERE postcode != alias_postcode
),

api_lookup_aliases AS (
    SELECT
        postcode,
        query_postcode AS alias_postcode,
        'api' AS correction_type
    FROM {{ ref('stg_postal_code_lookup') }}
    WHERE query_postcode != postcode
),

combined AS (
    SELECT DISTINCT * FROM empty_postcodes_result
    UNION ALL
    SELECT DISTINCT * FROM duplicate_postcodes
    UNION ALL
    SELECT DISTINCT * FROM api_lookup_aliases
),

combined_ranked AS (
    SELECT
        *,
        row_number() OVER (
            PARTITION BY postcode
            ORDER BY correction_type, alias_postcode
        ) AS rn
    FROM combined
),

final AS (
    SELECT
        postcode,
        alias_postcode,
        correction_type
    FROM combined_ranked
    WHERE rn = 1
)

SELECT * FROM final
