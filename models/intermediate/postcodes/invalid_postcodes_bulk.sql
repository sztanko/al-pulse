WITH
non_unique_positions AS (
    SELECT
        lng,
        lat,
        count(DISTINCT cp7)
    FROM {{ ref("stg_postal_codes_raw") }}
    GROUP BY 1, 2
    HAVING count(DISTINCT cp7) > 1
)

SELECT DISTINCT
    cp7 AS postcode,
    district,
    municipality,
    locality,
    lng,
    lat
FROM {{ ref("stg_postal_codes_raw") }}

WHERE (lng, lat) IN (SELECT
    nup.lng,
    nup.lat
FROM non_unique_positions AS nup)
