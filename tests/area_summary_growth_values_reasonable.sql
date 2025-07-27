-- Test to ensure that growth calculations are within reasonable bounds
-- Growth rates should typically be between -100% and +1000% (10x growth max)
-- This catches calculation errors and data quality issues

SELECT 
    area_name,
    admin_type,
    al_count_growth_pcnt,
    CASE 
        WHEN al_count_growth_pcnt < -1.0 THEN 'Growth less than -100% (impossible decline)'
        WHEN al_count_growth_pcnt > 10.0 THEN 'Growth more than 1000% (suspicious)'
        ELSE 'OK'
    END as issue_type
FROM {{ ref('area_summary') }}
WHERE al_count_growth_pcnt IS NOT NULL
  AND (
    al_count_growth_pcnt < -1.0   -- Less than -100% (impossible)
    OR al_count_growth_pcnt > 10.0 -- More than 1000% (suspicious)
  )