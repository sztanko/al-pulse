WITH duplicate_postcodes AS (

    SELECT * FROM {{ ref('invalid_postcodes_api') }}
    UNION ALL
    SELECT * FROM {{ ref('invalid_postcodes_bulk') }}

),

min_groups AS (
    SELECT
        lng,
        lat,
        min(postcode) AS alias_postcode,
        count(DISTINCT postcode) AS num_postcodes
    FROM duplicate_postcodes
    GROUP BY lng, lat
    HAVING count(DISTINCT postcode) > 1

),

postcode_enrichment AS (
    SELECT
        dp.postcode,
        min(min_groups.alias_postcode) AS alias_postcode,
        'duplicate' AS correction_type
    FROM duplicate_postcodes AS dp
    INNER JOIN min_groups ON dp.lng = min_groups.lng AND dp.lat = min_groups.lat
    GROUP BY dp.postcode
)

SELECT * FROM postcode_enrichment
WHERE postcode != alias_postcode
