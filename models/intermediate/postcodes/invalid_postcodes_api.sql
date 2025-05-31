WITH
non_unique_positions AS (
    SELECT
        lng,
        lat,
        count(DISTINCT postcode) AS num_postcodes,
        min(postcode) AS postcode
    FROM {{ ref("stg_postal_code_lookup") }}
    GROUP BY 1, 2
    HAVING count(DISTINCT postcode) > 1
)

SELECT DISTINCT
    postcode,
    district,
    municipality,
    locality,
    lng,
    lat
FROM {{ ref("stg_postal_code_lookup") }}

WHERE (lng, lat) IN (SELECT
    nup.lng,
    nup.lat
FROM non_unique_positions AS nup)
ORDER BY postcode
