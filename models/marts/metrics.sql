{% for metric, agg in var('metrics').items() %}
    SELECT
        '{{ metric }}' AS metric_name,
        '{{ agg }}' AS aggregation
    {% if not loop.last -%}UNION ALL{%- endif -%}
{% endfor %}
