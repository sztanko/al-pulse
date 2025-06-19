SELECT
    area_id,
    year_month,
    count(*) AS c
FROM {{ ref("region_stats") }}

GROUP BY area_id, year_month
HAVING count(*) > 1
ORDER BY 3 DESC
