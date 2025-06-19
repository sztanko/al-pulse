SELECT
    locality_id,
    count(DISTINCT municipality_id),
    count(*)
FROM {{ ref('postcodes') }}
WHERE locality_id IS NOT null
GROUP BY
    1
HAVING count(DISTINCT municipality_id) > 1
ORDER BY 3 DESC
