WITH
distinct_combinations AS (
    SELECT DISTINCT
        area_type,
        context_area_type,
        area_id,
        context_area_id,
        year_month
    FROM {{ ref('region_stats_per_metric') }}
),

combined AS (
    SELECT
        dc.area_type,
        dc.context_area_type,
        dc.area_id,
        dc.context_area_id,
        dc.year_month,
        {% for metric in var('metrics').keys() %}
            {{ metric }}.value AS value_{{ metric }},
            {{ metric }}.cumulative_value AS cumulative_value_{{ metric }},
            {{ metric }}.rank_month AS rank_month_{{ metric }},
            {{ metric }}.rank_cumulative AS rank_cumulative_{{ metric }}
            {%- if not loop.last -%},{%- endif -%}
        {% endfor %}
    FROM distinct_combinations AS dc
    {% for metric in var('metrics').keys() %}
        LEFT JOIN {{ ref('region_stats_per_metric') }} AS {{ metric }} ON
            dc.area_type = {{ metric }}.area_type
            AND dc.context_area_type = {{ metric }}.context_area_type
            AND dc.area_id = {{ metric }}.area_id
            AND dc.context_area_id = {{ metric }}.context_area_id
            AND dc.year_month = {{ metric }}.year_month
            AND {{ metric }}.metric_name = '{{ metric }}'
    {% endfor %}
),

distinct_combinations_metrics AS (
    SELECT DISTINCT
        area_type,
        area_id,
        year_month,
        {% for metric in var('metrics').keys() %}
            value_{{ metric }},
            cumulative_value_{{ metric }}
            {%- if not loop.last -%},{%- endif -%}
        {% endfor %}
    FROM combined
),

flattened AS (
    SELECT
        -- dcm.area_type,
        dcm.area_id,
        dcm.year_month,
        {% for metric in var('metrics').keys() %}
            dcm.value_{{ metric }},
            dcm.cumulative_value_{{ metric }},
            -- m.rank_month_{{ metric }} AS municipality_rank_month_{{ metric }},
            m.rank_cumulative_{{ metric }} AS municipality_rank_{{ metric }},
            -- r.rank_month_{{ metric }} AS region_rank_month_{{ metric }},
            r.rank_cumulative_{{ metric }} AS region_rank_{{ metric }},
            -- c.rank_month_{{ metric }} AS country_rank_month_{{ metric }},
            c.rank_cumulative_{{ metric }} AS country_rank_{{ metric }}
            {%- if not loop.last -%},{%- endif -%}
        {% endfor %}
    FROM distinct_combinations_metrics AS dcm
    LEFT JOIN combined AS m
        ON
            dcm.area_type = m.area_type
            AND dcm.area_id = m.area_id
            AND dcm.year_month = m.year_month
            AND m.context_area_type = 'municipality'
    LEFT JOIN combined AS r
        ON
            dcm.area_type = r.area_type
            AND dcm.area_id = r.area_id
            AND dcm.year_month = r.year_month
            AND r.context_area_type = 'region'
    LEFT JOIN combined AS c ON
        dcm.area_type = c.area_type
        AND dcm.area_id = c.area_id
        AND dcm.year_month = c.year_month
        AND c.context_area_type = 'country'

)

SELECT * FROM flattened
ORDER BY area_id, year_month
