-- Test to ensure that growth calculations are not NULL for regions when historical data exists
-- This prevents the bug where JOIN conditions fail to match current and historical data

WITH regions_with_historical_data AS (
    -- Check which regions have data 3 years ago
    SELECT DISTINCT s.area_id
    FROM {{ ref('region_stats') }} s
    INNER JOIN {{ ref('admin') }} a ON s.area_id = a.osm_id
    WHERE a.admin_type = 'region' 
      AND s.year_month = DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '3 year'
),

regions_with_current_data AS (
    -- Check which regions have current data
    SELECT DISTINCT s.area_id
    FROM {{ ref('region_stats') }} s
    INNER JOIN {{ ref('admin') }} a ON s.area_id = a.osm_id
    WHERE a.admin_type = 'region' 
      AND s.year_month = DATE_TRUNC('month', CURRENT_DATE)
),

regions_that_should_have_growth AS (
    -- Regions that exist in both current and historical data should have growth calculations
    SELECT h.area_id
    FROM regions_with_historical_data h
    INNER JOIN regions_with_current_data c ON h.area_id = c.area_id
)

-- Test: All regions with both historical and current data should have non-NULL growth
SELECT 
    a.name as region_name,
    area_summary.al_count_growth_pcnt
FROM {{ ref('area_summary') }} area_summary
INNER JOIN {{ ref('admin') }} a ON area_summary.area_slug = a.slug
INNER JOIN regions_that_should_have_growth r ON a.osm_id = r.area_id
WHERE area_summary.admin_type = 'region'
  AND area_summary.al_count_growth_pcnt IS NULL