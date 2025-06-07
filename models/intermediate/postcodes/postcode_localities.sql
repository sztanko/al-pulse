WITH all_postcodes AS (
    SELECT
        cp7 AS postcode,
        locality
    FROM {{ ref('stg_postal_codes_raw') }}
    UNION ALL
    SELECT
        postcode,
        locality
    FROM {{ ref('stg_postal_code_lookup') }}
)

SELECT DISTINCT ON (postcode)
    postcode,
    locality
FROM all_postcodes
WHERE locality IS NOT null
ORDER BY postcode, locality
