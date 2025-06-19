SELECT
    area_type,
    context_area_type,
    area_id,
    count(DISTINCT context_area_id),
    count(*)
FROM {{ ref('region_stats_per_metric') }}
WHERE
    area_type = 'locality'
    AND area_id IS NOT null
GROUP BY
    1, 2, 3
HAVING count(DISTINCT context_area_id) > 1
ORDER BY 5 DESC
