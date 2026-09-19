-- Every locality the map draws, from both registers.
--
-- The Azorean rows carry no rank: ranks come from the time series, which their
-- register cannot enter. The map's rank layer therefore shows them as
-- not-ranked rather than as rank zero, and says so in its legend — a locality
-- with 1,687 registrations coloured as if it had none would be the worst
-- possible reading of this data.
WITH national AS (
    SELECT
        a.osm_id AS id,
        a.osm_id::INT::TEXT AS admin_id,
        a.name,
        a.full_name,
        a.slug,
        a.geom,
        a.population,
        stats.cumulative_value_c::INT AS al_count,
        stats.country_rank_c AS rank_within_country,
        round(1000.0 / stats.cumulative_value_al_per_1000, 2) AS people_per_al,
        stats.country_rank_al_per_1000 AS people_per_al_rank,
        TRUE AS has_time_series
    FROM {{ ref('admin') }} AS a
    INNER JOIN {{ ref('region_stats') }} AS stats
        ON
            a.osm_id = stats.area_id
            AND stats.year_month = date_trunc('month', current_date)
    WHERE
        a.admin_type = 'locality'
        AND a.osm_id IS NOT NULL
),

azores AS (
    SELECT
        a.osm_id AS id,
        a.osm_id::INT::TEXT AS admin_id,
        a.name,
        a.full_name,
        a.slug,
        a.geom,
        s.population,
        s.al_count::INT AS al_count,
        CAST(NULL AS BIGINT) AS rank_within_country,
        s.inhabitants_per_al AS people_per_al,
        CAST(NULL AS BIGINT) AS people_per_al_rank,
        FALSE AS has_time_series
    FROM {{ ref('azores_area_stats') }} AS s
    INNER JOIN {{ ref('admin') }} AS a ON s.area_id = a.osm_id
    WHERE s.admin_type = 'locality'
)

SELECT * FROM national
UNION ALL
SELECT * FROM azores
ORDER BY full_name ASC
