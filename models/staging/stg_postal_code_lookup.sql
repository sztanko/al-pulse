SELECT
    postcode,
    title,
    query_postcode,
    district,
    municipality,
    locality,
    lat,
    lng
FROM {{ source('raw', 'postal_code_lookup') }}
