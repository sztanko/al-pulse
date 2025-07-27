-- Area summary statistics for both home page and detail pages
-- Provides statistics for areas and their descendants (children and grandchildren)
WITH area_hierarchy AS (
    SELECT
        a.osm_id,
        a.slug,
        a.name,
        a.admin_type,
        a.parent_id,
        a.municipality_slug,
        a.region_slug,
        -- Direct parent
        CASE 
            WHEN a.admin_type = 'locality' THEN a.municipality_slug
            WHEN a.admin_type = 'municipality' THEN a.region_slug
            ELSE NULL
        END AS direct_parent_slug,
        -- All ancestor slugs (for descendant relationships)
        a.municipality_slug AS ancestor_municipality_slug,
        a.region_slug AS ancestor_region_slug
    FROM {{ ref('admin') }} AS a
),

regional_monthly AS (
    SELECT
        '/areas/' || a.slug AS area_url,
        a.name AS area_name,
        a.slug AS area_slug,
        a.admin_type,
        s.year_month AS month_date,
        s.cumulative_value_c AS al_count,
        s.cumulative_value_al_per_1000 AS al_per_1000,
        1000.0 / s.cumulative_value_al_per_1000 AS inhabitants_per_al,
        s.country_rank_c AS rank_within_country,
        h.direct_parent_slug,
        h.ancestor_municipality_slug,
        h.ancestor_region_slug
    FROM {{ ref('region_stats') }} AS s
    INNER JOIN {{ ref('admin') }} AS a ON s.area_id = a.osm_id
    INNER JOIN area_hierarchy AS h ON s.area_id = h.osm_id
),

latest AS (
    SELECT *
    FROM regional_monthly
    WHERE month_date = DATE_TRUNC('month', CURRENT_DATE)
),

prev_year AS (
    SELECT
        area_name,
        area_slug,
        direct_parent_slug,
        ancestor_municipality_slug,
        ancestor_region_slug,
        al_count AS al_count_prev_year,
        rank_within_country AS rank_prev_year
    FROM regional_monthly
    WHERE month_date = DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '3 year'
)

SELECT
    l.direct_parent_slug,
    l.ancestor_municipality_slug,
    l.ancestor_region_slug,
    l.area_url,
    l.area_name,
    l.area_slug,
    l.admin_type,
    l.al_count,
    l.inhabitants_per_al,
    l.al_per_1000,
    l.rank_within_country,
    (l.al_count - p.al_count_prev_year) / NULLIF(p.al_count_prev_year, 0) AS al_count_growth_pcnt,
    (p.rank_prev_year - l.rank_within_country) AS rank_within_country_change
FROM latest AS l
LEFT JOIN prev_year AS p ON (
    l.area_slug = p.area_slug AND
    COALESCE(l.direct_parent_slug, '') = COALESCE(p.direct_parent_slug, '') AND
    COALESCE(l.ancestor_municipality_slug, '') = COALESCE(p.ancestor_municipality_slug, '') AND
    COALESCE(l.ancestor_region_slug, '') = COALESCE(p.ancestor_region_slug, '')
)
ORDER BY l.ancestor_region_slug, l.ancestor_municipality_slug, l.area_name
