-- Test to ensure all admin types have reasonable growth data coverage
-- when historical data exists for that admin type
-- This catches issues where JOIN conditions fail for specific admin types

WITH admin_type_coverage AS (
    SELECT 
        admin_type,
        COUNT(*) as total_areas,
        COUNT(al_count_growth_pcnt) as areas_with_growth,
        COUNT(al_count_growth_pcnt) * 100.0 / COUNT(*) as coverage_percent
    FROM {{ ref('area_summary') }}
    GROUP BY admin_type
),

-- Check if historical data exists for each admin type (3 years ago)
admin_types_with_historical_data AS (
    SELECT DISTINCT a.admin_type
    FROM {{ ref('region_stats') }} s
    INNER JOIN {{ ref('admin') }} a ON s.area_id = a.osm_id
    WHERE s.year_month = DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '3 year'
)

-- Test: Admin types with historical data should have >80% growth coverage
SELECT 
    c.admin_type,
    c.total_areas,
    c.areas_with_growth,
    c.coverage_percent
FROM admin_type_coverage c
INNER JOIN admin_types_with_historical_data h ON c.admin_type = h.admin_type
WHERE c.coverage_percent < 80.0  -- Less than 80% coverage indicates a problem