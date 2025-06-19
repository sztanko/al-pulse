SELECT
    area_type,
    context_area_type,
    area_id,
    context_area_id,
    year_month,
    metric_name,
    count(*) AS c
-- area_id, year_month, count(1) as c 
FROM {{ ref("region_stats_per_metric") }}

GROUP BY 1, 2, 3, 4, 5, 6
HAVING count(*) > 1
ORDER BY 7 DESC
