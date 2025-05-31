WITH
duplicate_coords AS (
    SELECT
        lng,
        lat,
        count(DISTINCT cp7) AS num_duplicates
    FROM {{ ref('stg_postal_codes_raw') }}
    GROUP BY lng, lat
    HAVING count(DISTINCT cp7) > 1
),

duplicate_postcodes AS (
    SELECT DISTINCT cp7 AS postcode
    FROM {{ ref('stg_postal_codes_raw') }} AS p
    WHERE EXISTS (
        SELECT 1
        FROM duplicate_coords AS dc
        WHERE dc.lng = p.lng AND dc.lat = p.lat
    )
)

SELECT * FROM duplicate_postcodes
