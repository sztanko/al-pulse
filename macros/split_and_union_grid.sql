{% macro split_and_union_grid(input_table, geom_col, grid_size) %}
with
source as (
    select ST_UNION_AGG({{ geom_col }}) as geom from {{ input_table }}
),

bounds as (
    select
        ST_XMin(geom) as xmin,
        ST_XMax(geom) as xmax,
        ST_YMin(geom) as ymin,
        ST_YMax(geom) as ymax
    from source
),

grid as (
    select
        ST_MakePolygon(ST_MakeLine(ARRAY[
            ST_Point(x, y),
            ST_Point(x + dx, y),
            ST_Point(x + dx, y + dy),
            ST_Point(x, y + dy),
            ST_Point(x, y)
        ])) as cell_geom
    from bounds,
    unnest(generate_series(0, {{ grid_size|int - 1 }})) as i_struct,
    unnest(generate_series(0, {{ grid_size|int - 1 }})) as j_struct,
    (select (xmax - xmin) / {{ grid_size }} as dx, (ymax - ymin) / {{ grid_size }} as dy from bounds),
    (select xmin as x0, ymin as y0 from bounds),
    lateral (select x0 + i_struct.unnest * dx as x, y0 + j_struct.unnest * dy as y)
),

intersected as (
    select
        ST_Intersection(cell_geom, source.geom) as geom
    from grid, source
    where ST_Intersects(cell_geom, source.geom)
),

tagged as (
    select
        geom,
        ST_NPoints(geom)::integer as num_points,
        case when ST_NPoints(geom) = 5 then true else false end as is_inner
    from intersected
),

union_inner as (
    select ST_Union_Agg(st_buffer(geom, 0.0001)) as geom,
    true as is_inner
    from tagged
    where is_inner
),

outers as (
    select st_buffer(geom, 0.0001) as geom,
    false as is_inner
    from tagged
    where not is_inner
)

select * from outers
union all
select * from union_inner
{% endmacro %}
