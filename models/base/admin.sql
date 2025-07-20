{{
    config(
        pre_hook="DROP INDEX IF EXISTS idx_admin_areas_geom",
        post_hook="CREATE INDEX IF NOT EXISTS idx_admin_areas_geom ON {{ this }} USING RTREE(geom)",
        materialized='table'
    )
}}

WITH admin_areas AS (
    SELECT
        osm_id::INT AS osm_id,
        capitalize(name) AS name,
        admin_level::INT AS admin_level,
        population::INT AS population,
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
        child.population,
        parent.osm_id AS parent_id,
        parent.name AS parent_name,
        parent.admin_level AS parent_level
    FROM admin_areas AS child
    LEFT JOIN admin_areas AS parent
        ON
            st_contains(parent.geom, child.geom)
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
),

result AS (
    SELECT
        a.osm_id,
        capitalize(a.name) AS name,
        a.population,
        a.admin_level,
        CASE
            WHEN a.admin_level = 8 THEN 'locality'
            WHEN a.admin_level = 7 THEN 'municipality'
            ELSE 'region'
        END AS admin_type,
        np.num_parents AS depth,
        rp.parent_id,
        capitalize(rp.parent_name) AS parent_name,
        rp.parent_level,
        capitalize(np.parent_path) AS parent_path,
        CASE
            WHEN np.parent_path IS NULL THEN capitalize(a.name)
            ELSE capitalize(a.name || ', ' || np.parent_path)
        END AS full_name,
        a.geom,
        pp.parent_id IS NULL AS is_leaf,
        lower(
            regexp_replace(
                regexp_replace(
                    regexp_replace(strip_accents(trim(name || ', ' || coalesce(parent_path, ''))), '[^0-9A-Za-z]+', '_', 'g'),
                    '_{2,}', '_', 'g'
                ),
                '^_|_$', '', 'g'
            )
        ) AS slug

    FROM admin_areas AS a
    LEFT JOIN num_parents AS np
        ON a.osm_id = np.osm_id
    LEFT JOIN top_level_parents AS rp
        ON a.osm_id = rp.osm_id
    LEFT JOIN parents_only AS pp
        ON a.osm_id = pp.parent_id
),

admin_with_hierarchy AS (
    SELECT
        a.*,
        CASE
            WHEN a.admin_type = 'locality' THEN parent.slug
            WHEN a.admin_type = 'municipality' THEN a.slug
        END AS municipality_slug,
        CASE
            WHEN a.admin_type = 'locality' THEN grandparent.slug
            WHEN a.admin_type = 'municipality' THEN parent.slug
            WHEN a.admin_type = 'region' THEN a.slug
        END AS region_slug
    FROM result AS a
    LEFT JOIN result AS parent ON a.parent_id = parent.osm_id
    LEFT JOIN result AS grandparent ON parent.parent_id = grandparent.osm_id
)

SELECT * FROM admin_with_hierarchy
