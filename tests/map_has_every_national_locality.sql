-- The map's national localities must not collapse to a handful. They did on
-- 2026-11-02, when a calendar-month filter matched no row of the series
-- and only the 152 Azorean localities were left; see macros/latest_month.sql.
-- Fails when fewer than 90% of the localities with a series reach the map.
WITH counts AS (
    SELECT
        (SELECT count(*) FROM {{ ref('localities_with_data_for_geojson') }} WHERE has_time_series) AS on_map,
        (SELECT count(DISTINCT area_id) FROM {{ ref('region_stats') }} AS s
            JOIN {{ ref('admin') }} AS a ON s.area_id = a.osm_id AND a.admin_type = 'locality') AS with_series
)
SELECT * FROM counts WHERE on_map < 0.9 * with_series
