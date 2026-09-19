-- The Azores must never reach a time series, and never carry a figure derived
-- from one.
--
-- This is the load-bearing invariant of the whole Azorean integration. Their
-- register records no dates, so anything that means "compared with the same
-- thing at another time" — a monthly series, a growth percentage, a rank, a
-- rank movement — cannot exist for them. The site prints an asterisk saying so.
-- If this test ever fails, that asterisk has become a lie and a chart on the
-- site is showing invented history.
--
-- Each row returned names one way it broke.

WITH azores_areas AS (
    SELECT
        a.osm_id,
        a.slug
    FROM {{ ref('admin') }} AS a
    INNER JOIN {{ ref('admin') }} AS r
        ON a.region_slug = r.slug AND r.osm_id = {{ var('azores_region_osm_id') }}
)

-- No Azorean area may appear in the monthly series at all.
SELECT
    'in_region_stats' AS violation,
    az.slug AS area_slug
FROM {{ ref('region_stats') }} AS s
INNER JOIN azores_areas AS az ON s.area_id = az.osm_id

UNION ALL

-- Nor may one be flagged as having a series.
SELECT
    'has_time_series_is_true',
    s.area_slug
FROM {{ ref('area_summary') }} AS s
INNER JOIN azores_areas AS az ON s.area_slug = az.slug
WHERE s.has_time_series

UNION ALL

-- Nor carry a growth figure, a rank, or a rank movement.
SELECT
    'has_a_time_derived_figure',
    s.area_slug
FROM {{ ref('area_summary') }} AS s
INNER JOIN azores_areas AS az ON s.area_slug = az.slug
WHERE
    s.al_count_growth_pcnt IS NOT NULL
    OR s.rank_within_country IS NOT NULL
    OR s.rank_within_country_change IS NOT NULL

UNION ALL

-- Nor on the map.
SELECT
    'ranked_on_the_map',
    g.slug
FROM {{ ref('localities_with_data_for_geojson') }} AS g
INNER JOIN azores_areas AS az ON g.id = az.osm_id
WHERE g.rank_within_country IS NOT NULL OR g.people_per_al_rank IS NOT NULL

UNION ALL

-- And the converse: every area that is *not* Azorean must still have a series,
-- or this integration has quietly broken the national site.
SELECT
    'national_area_lost_its_series',
    s.area_slug
FROM {{ ref('area_summary') }} AS s
LEFT JOIN azores_areas AS az ON s.area_slug = az.slug
WHERE az.slug IS NULL AND NOT s.has_time_series
