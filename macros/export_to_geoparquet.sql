{% macro export_to_geoparquet(table, output_path) %}
{% set full_path = output_path | replace("'", "''") %}
COPY (SELECT * FROM {{ ref(table) }}) TO '{{ full_path }}' (FORMAT PARQUET);
{% endmacro %}
