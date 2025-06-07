SELECT
    a.osm_id,
    a.name,
    a.admin_level,
    a.parent_id,
    a.parent_name,
    a.parent_level,
    a.parent_path,
    a.is_leaf,
    a.geom,
    count(*) AS al_count
FROM {{ ref('admin') }} AS a
INNER JOIN {{ ref('al') }} AS al
    ON
        a.osm_id
        = CASE
            -- WHEN a.admin_level = 8 THEN al.locality_osm_id
            WHEN a.admin_level = 7 THEN al.municipality_osm_id
            WHEN a.admin_level IN (6, 4) THEN al.region_osm_id
        END
WHERE
    admin_level > 2
    AND admin_level > 4
    -- AND depth = '2'
    AND is_leaf = false
-- and al.region_name='Madeira'
GROUP BY
    1, 2, 3, 4, 5, 6, 7, 8, 9
ORDER BY
    1, 2, 3, 4, 5, 6, 7, 8, 9
