-- Admin statistics with growth calculations for area detail pages
SELECT 
    s.*,
    s.cumulative_value_c / s_2015.cumulative_value_c AS growth_since_2015,
    1000 / s.cumulative_value_al_per_1000 AS inhabitants_per_al,
    (1000 / s.cumulative_value_al_per_1000) / (1000 / s_old.cumulative_value_al_per_1000) - 1 AS inhabitants_per_al_growth,
    s.cumulative_value_c / NULLIF(s_old.cumulative_value_c, 0) - 1 AS growth_c,
    s.region_rank_al_per_1000 - s_old.region_rank_al_per_1000 AS region_rank_al_per_1000_change,
    s.region_rank_c - s_old.region_rank_c AS region_rank_change_c,
    s.country_rank_c - s_old.country_rank_c AS country_rank_change_c,
    s.municipality_rank_c - s_old.municipality_rank_c AS municipality_rank_change_c,
    s.cumulative_value_num_rooms / NULLIF(s_old.cumulative_value_num_rooms, 0) - 1 AS num_rooms_growth,
    s.cumulative_value_num_guests / NULLIF(s_old.cumulative_value_num_guests, 0) AS num_guests_growth,
    a.slug,
    a.name,
    a.full_name,
    a.admin_type,
    a.parent_name,
    a.municipality_slug,
    a.region_slug
FROM {{ ref('admin_stats') }} AS s
JOIN {{ ref('admin') }} AS a ON a.osm_id = s.area_id
JOIN {{ ref('admin_stats') }} AS s_old ON s.area_id = s_old.area_id 
    AND s_old.year_month = DATE_TRUNC('month', CURRENT_DATE - INTERVAL '3 years')
JOIN {{ ref('admin_stats') }} AS s_2015 ON s.area_id = s_2015.area_id 
    AND s_2015.year_month = '2015-01-01'
WHERE s.year_month = DATE_TRUNC('month', CURRENT_DATE)