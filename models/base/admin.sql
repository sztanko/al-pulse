{{
    config(
        pre_hook="DROP INDEX IF EXISTS idx_admin_areas_geom",
        post_hook="CREATE INDEX IF NOT EXISTS idx_admin_areas_geom ON {{ this }} USING RTREE(geom)",
        materialized='table'
    )
}}

WITH admin_areas AS (
    SELECT
        osm_id,
        name,
        admin_level::INT AS admin_level,
        geom
    FROM st_read({{ source("geojson", "admin") }})
),

-- Find parent for each polygon
with_parents AS (
    SELECT
        child.osm_id,
        child.name,
        child.admin_level,
        child.geom,
        parent.osm_id AS parent_id,
        parent.name AS parent_name,
        parent.admin_level AS parent_level
    FROM admin_areas AS child
    LEFT JOIN admin_areas AS parent
        ON
            st_contains(parent.geom, st_centroid(child.geom))
            AND child.admin_level > parent.admin_level
),

num_parents AS (
    SELECT
        osm_id,
        coalesce(count(parent_id), 0) AS num_parents,
        string_agg(
            parent_name, ', '
            ORDER BY parent_level DESC
        ) AS parent_path
    FROM with_parents
    GROUP BY osm_id
),

-- Rank to get the highest-level parent (smallest admin_level)
ranked_parents AS (
    SELECT
        *,
        row_number() OVER (
            PARTITION BY osm_id
            ORDER BY parent_level DESC
        ) AS rnk
    -- get list of name, ordered by parent_level desc 

    FROM with_parents
),

top_level_parents AS (
    SELECT
        osm_id,
        parent_id,
        parent_name,
        parent_level
    FROM ranked_parents
    WHERE rnk = 1
),

parents_only AS (
    SELECT DISTINCT parent_id FROM top_level_parents
)

SELECT
    a.osm_id,
    a.name,
    a.admin_level,
    np.num_parents AS depth,
    rp.parent_id,
    rp.parent_name,
    rp.parent_level,
    np.parent_path,
    a.geom,
    pp.parent_id IS NULL AS is_leaf

FROM admin_areas AS a
LEFT JOIN num_parents AS np
    ON a.osm_id = np.osm_id
LEFT JOIN top_level_parents AS rp
    ON a.osm_id = rp.osm_id
LEFT JOIN parents_only AS pp
    ON a.osm_id = pp.parent_id
-- WHERE a.name LIKE '%Calheta%'
