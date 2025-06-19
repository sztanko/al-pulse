SELECT
    postcode,
    count(*)
FROM {{ ref('postcodes') }}
GROUP BY 1
HAVING count(*) > 1
ORDER BY 1
