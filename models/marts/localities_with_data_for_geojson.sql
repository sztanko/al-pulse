SELECT
    a.osm_id AS id,
    a.osm_id::int::text AS admin_id,
    a.name,
    a.full_name,
    a.geom,
    a.population,
    stats.cumulative_value_c::int AS c,
    stats.country_rank_c AS c_rank,
    ROUND(1000.0 / stats.cumulative_value_al_per_1000, 2) AS people_per_al,
    stats.country_rank_al_per_1000 AS people_per_al_rank
FROM {{ ref('admin') }} AS a
INNER JOIN {{ ref('region_stats') }} AS stats
    ON
        a.osm_id = stats.area_id
        AND year_month = DATE_TRUNC('month', CURRENT_DATE)
WHERE
    a.admin_type = 'locality'
    AND a.osm_id IS NOT NULL
ORDER BY a.full_name ASC
