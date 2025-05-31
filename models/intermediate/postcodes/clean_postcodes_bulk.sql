SELECT
    cp7 AS postcode,
    district,
    municipality,
    locality,
    lng,
    lat
FROM {{ ref("stg_postal_codes_raw") }}
WHERE
    cp7 NOT IN (
        SELECT postcode
        FROM {{ ref("invalid_postcodes_bulk") }}
    )
