WITH all_postcodes AS (
    -- SELECT
    --     cp7 AS postcode,
    --     locality
    -- FROM {{ ref('stg_postal_codes_raw') }}
    -- UNION ALL
    SELECT
        postcode,
        locality
    FROM {{ ref('stg_postal_code_lookup') }}
),

result AS (
    SELECT DISTINCT ON (postcode)
        postcode,
        locality
    FROM all_postcodes
    WHERE locality IS NOT null
    ORDER BY postcode, locality
)

SELECT * FROM result

-- select locality, count(1) from result
-- where postcode like '9370-%'
-- group by 1
