WITH base AS (
    SELECT
        al_id,
        registration_number,
        year(registration_date) AS registration_year,
        strftime(registration_date, '%Y-%m') AS year_month,
        house_type,
        is_building_post_1951,
        beds,
        max_guests,
        rooms,
        postal_code,
        locality_osm_id AS locality,
        -- locality_name || ', ' || municipality_name || ', ' || region_name AS locality,
        municipality_osm_id AS municipality,
        -- municipality_name AS municipality,
        region_osm_id AS region,
        -- region_name AS region,
        0 AS country,
        is_building_post_1951
    FROM {{ ref('al') }}
    WHERE is_active = true
),

{% set area_groups = [
    ['locality', 'municipality'],
    ['locality', 'region'],
    ['locality', 'country'],
    ['municipality', 'region'],
    ['municipality', 'country'],
    ['region', 'country'],
    ['country', 'country'],
] %}

data_points AS (
    {% for p in area_groups %}
        SELECT
            '{{ p[0] }}' AS area_type,
            '{{ p[1] }}' AS context_area_type,
            base.{{ p[0] }} AS area_id,
            base.{{ p[1] }} AS context_area_id,
            year_month,
            1 AS c,
            max_guests AS num_guests,
            rooms AS num_rooms,
            cast(is_building_post_1951 AS INTEGER) AS is_building_post_1951,
            cast(rooms = 0 AS INTEGER) AS rooms_0,
            cast(rooms = 1 AS INTEGER) AS rooms_1,
            cast(rooms = 2 AS INTEGER) AS rooms_2,
            cast(rooms = 3 AS INTEGER) AS rooms_3,
            cast(rooms > 3 AS INTEGER) AS rooms_more_than_3,
            cast(house_type = 'Moradia' AS INTEGER) AS is_moradia,
            cast(house_type = 'Apartamento' AS INTEGER) AS is_apartamento
        FROM base
        {% if not loop.last -%}UNION ALL{%- endif -%}
    {%- endfor -%}
),

grouped_data AS (
    SELECT
        area_type,
        context_area_type,
        year_month,
        area_id,
        context_area_id,
        sum(c) AS c,
        sum(num_guests) AS num_guests,
        sum(num_rooms) AS num_rooms,
        sum(is_building_post_1951) AS is_building_post_1951,
        sum(rooms_0) AS rooms_0,
        sum(rooms_1) AS rooms_1,
        sum(rooms_2) AS rooms_2,
        sum(rooms_3) AS rooms_3,
        sum(rooms_more_than_3) AS rooms_more_than_3,
        sum(is_moradia) AS is_moradia,
        sum(is_apartamento) AS is_apartamento
    FROM data_points
    GROUP BY
        area_type,
        context_area_type,
        year_month,
        area_id,
        context_area_id
),

distinct_areas AS (
    SELECT DISTINCT
        gd.area_type,
        gd.context_area_type,
        gd.area_id,
        gd.context_area_id,
        a.population
    FROM grouped_data AS gd
    LEFT JOIN {{ ref('admin') }} AS a ON gd.area_id = a.osm_id
),

distinct_year_months AS (
    SELECT DISTINCT year_month
    FROM grouped_data
),

all_rows AS (
    SELECT
        a.area_type,
        a.context_area_type,
        a.area_id,
        a.context_area_id,
        y.year_month,
        coalesce(g.c, 0) AS c,
        1000.0 * (cast(coalesce(g.c, 0.0) AS FLOAT)) / a.population AS al_per_1000,
        coalesce(g.num_guests, 0) AS num_guests,
        coalesce(g.num_rooms, 0) AS num_rooms,
        coalesce(g.is_building_post_1951, 0) AS is_building_post_1951,
        coalesce(g.rooms_0, 0) AS rooms_0,
        coalesce(g.rooms_1, 0) AS rooms_1,
        coalesce(g.rooms_2, 0) AS rooms_2,
        coalesce(g.rooms_3, 0) AS rooms_3,
        coalesce(g.rooms_more_than_3, 0) AS rooms_more_than_3,
        coalesce(g.is_moradia, 0) AS is_moradia,
        coalesce(g.is_apartamento, 0) AS is_apartamento
    FROM distinct_areas AS a
    CROSS JOIN distinct_year_months AS y
    LEFT JOIN grouped_data AS g
        ON
            a.area_type = g.area_type
            AND a.context_area_type = g.context_area_type
            AND a.area_id = g.area_id
            AND a.context_area_id = g.context_area_id
            AND y.year_month = g.year_month

),

with_cumulative AS (
    {% for metric, agg in var('metrics').items() %}

        SELECT
            area_type,
            context_area_type,
            year_month,
            area_id,
            context_area_id,
            '{{ metric }}' AS metric_name,
            {% if agg=='normal' %}
                {{ metric }}
            {% else %}
                cast({{ metric }} AS FLOAT) / nullif(c, 0)
            {% endif %} AS value,
            -- cumulative
            {% if agg == 'normal' %}
                sum({{ metric }}) OVER (
                    PARTITION BY area_type, context_area_type, area_id, context_area_id
                    ORDER BY year_month
                )
            {% else %}
                sum(cast({{ metric }} AS FLOAT)) OVER (
                    PARTITION BY area_type, context_area_type, area_id, context_area_id
                    ORDER BY year_month
                ) / nullif(sum(c) OVER (
                    PARTITION BY area_type, context_area_type, area_id, context_area_id
                    ORDER BY year_month
                ), 0)
            {% endif %} AS cumulative_value
        FROM all_rows
        {% if not loop.last -%}UNION ALL{%- endif -%}
    {% endfor %}
),

with_ranking AS (
    SELECT
        area_type,
        context_area_type,
        area_id,
        context_area_id,
        cast((year_month || '-01') AS DATE) AS year_month,
        metric_name,
        value,
        cumulative_value,
        percent_rank() OVER (
            PARTITION BY area_type, context_area_type, context_area_id, metric_name, year_month
            ORDER BY value DESC
        ) AS rank_month,
        percent_rank() OVER (
            PARTITION BY area_type, context_area_type, context_area_id, metric_name, year_month
            ORDER BY cumulative_value DESC
        ) AS rank_cumulative
    FROM with_cumulative
)

SELECT * FROM with_ranking
-- WHERE context_area_type = 'municipality' AND context_area_id = 'Lisboa'
-- and metric_name='c' and year_month = '2025-01'
ORDER BY area_type, area_id, year_month
