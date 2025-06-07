SELECT
    postcode,
    district,
    municipality,
    locality,
    lng,
    lat
FROM {{ ref("stg_postal_code_lookup") }}
WHERE
    postcode NOT IN (
        SELECT postcode
        FROM {{ ref("invalid_postcodes_api") }}
    )
    AND lng IS NOT NULL
    AND lat IS NOT NULL
