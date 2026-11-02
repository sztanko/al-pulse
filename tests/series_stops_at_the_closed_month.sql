-- The monthly series runs exactly to the month the latest pull closes:
-- nothing after it (on 2 November, nothing for November), and a row for it.
SELECT 'month after the data runs through' AS problem, year_month
FROM {{ ref('region_stats_per_metric') }}
WHERE year_month > {{ data_through_month() }}

UNION ALL

SELECT 'no row for the month the data runs through', NULL
WHERE NOT EXISTS (
    SELECT 1 FROM {{ ref('region_stats_per_metric') }}
    WHERE year_month = {{ data_through_month() }}
)
