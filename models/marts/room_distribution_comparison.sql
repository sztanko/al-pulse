WITH latest_room_stats AS (
    SELECT
        area_id,
        metric_name,
        cumulative_value AS value,
        CASE metric_name
            WHEN 'rooms_0' THEN 1
            WHEN 'rooms_1' THEN 2
            WHEN 'rooms_2' THEN 3
            WHEN 'rooms_3' THEN 4
            WHEN 'rooms_more_than_3' THEN 5
        END AS room_category,
        CASE metric_name
            WHEN 'rooms_0' THEN '0 rooms'
            WHEN 'rooms_1' THEN '1 room'
            WHEN 'rooms_2' THEN '2 rooms'
            WHEN 'rooms_3' THEN '3 rooms'
            WHEN 'rooms_more_than_3' THEN 'More than 3 rooms'
        END AS metric_description
    FROM {{ ref('region_stats_per_metric') }}
    WHERE
        year_month = date_trunc('month', current_date)
        AND metric_name IN ('rooms_0', 'rooms_1', 'rooms_2', 'rooms_3', 'rooms_more_than_3')
        AND context_area_type = 'country'
),

hierarchies AS (
    SELECT
        osm_id AS group_id,
        osm_id AS area_id,
        admin_type,
        full_name AS name,
        slug
    FROM {{ ref('admin') }}

    UNION ALL
    SELECT
        a.osm_id AS group_id,
        p.osm_id AS area_id,
        p.admin_type,
        p.full_name AS name,
        p.slug
    FROM {{ ref('admin') }} AS a
    INNER JOIN {{ ref('admin') }} AS p ON a.parent_id = p.osm_id

    UNION ALL
    SELECT
        a.osm_id AS group_id,
        pp.osm_id,
        pp.admin_type,
        pp.full_name AS name,
        pp.slug
    FROM {{ ref('admin') }} AS a
    INNER JOIN {{ ref('admin') }} AS p ON a.parent_id = p.osm_id
    INNER JOIN {{ ref('admin') }} AS pp ON p.parent_id = pp.osm_id

    UNION ALL
    SELECT
        a.osm_id AS group_id,
        ppp.osm_id AS area_id,
        ppp.admin_type,
        ppp.name,
        ppp.slug
    FROM {{ ref('admin') }} AS a
    INNER JOIN {{ ref('admin') }} AS p ON a.parent_id = p.osm_id
    INNER JOIN {{ ref('admin') }} AS pp ON p.parent_id = pp.osm_id
    INNER JOIN {{ ref('admin') }} AS ppp ON pp.parent_id = ppp.osm_id

    UNION ALL
    SELECT
        a.osm_id AS group_id,
        0 AS area_id,
        'country' AS admin_type,
        'Portugal' AS name,
        'portugal' AS slug
    FROM {{ ref('admin') }} AS a

),

admins AS (
    SELECT
        a.slug,
        a.osm_id
    FROM {{ ref('admin') }} AS a
    UNION ALL
    SELECT
        'portugal',
        0 AS osm_id
),

-- Get hierarchy information for each area
stats_with_hierarchies AS (
    SELECT
        aa.slug,
        h.group_id,
        r.metric_description AS metric_name,
        r.room_category,
        r.value,
        h.area_id,
        h.admin_type,
        h.name,
        CASE
            WHEN h.admin_type = 'locality' THEN 1
            WHEN h.admin_type = 'municipality' THEN 2
            WHEN h.admin_type = 'region' THEN 3
            WHEN h.admin_type = 'country' THEN 4
            ELSE 5
        END AS area_level
    FROM latest_room_stats AS r
    INNER JOIN admins AS a ON r.area_id = a.osm_id
    INNER JOIN hierarchies AS h ON r.area_id = h.area_id -- or (r.area_id = h.group_id and h.admin_type='country')
    INNER JOIN admins AS aa ON h.group_id = aa.osm_id

)

SELECT * FROM stats_with_hierarchies
ORDER BY group_id, area_level, room_category
