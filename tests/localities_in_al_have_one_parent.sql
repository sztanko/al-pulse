SELECT
    locality_osm_id,
    count(DISTINCT municipality_osm_id),
    count(*)
FROM {{ ref('al') }}
WHERE locality_osm_id IS NOT null
GROUP BY
    1
HAVING count(DISTINCT municipality_osm_id) > 1
ORDER BY 3 DESC
