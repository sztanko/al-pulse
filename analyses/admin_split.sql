{{
    config(
        materialized='table',
        pre_hook='DROP INDEX IF EXISTS idx_admin_squares_geom',
        post_hook='CREATE INDEX IF NOT EXISTS idx_admin_squares_geom ON {{ this }} USING RTREE(geom)',
    )
}}
WITH all_admin_areas AS (
    SELECT geom
    FROM {{ ref('admin') }}
    WHERE
        is_leaf IS FALSE
        AND admin_level > 4
),

grid AS (
{{ split_and_union_grid(
    input_table='all_admin_areas',
    geom_col='geom',
    grid_size=201
) }}
)

SELECT * FROM grid
