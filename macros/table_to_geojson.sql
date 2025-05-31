{% macro table_to_geojson(table, geom_column='geom') %}
{% set columns = adapter.get_columns_in_relation(ref(table)) %}
{% set props = [] %}

{% for col in columns %}
  {% if col.name != geom_column %}
    {% do props.append("'" ~ col.name ~ "', " ~ col.name) %}
  {% endif %}
{% endfor %}

SELECT json_object(
    'type', 'FeatureCollection',
    'features', json_group_array(
        json_object(
            'type', 'Feature',
            'geometry', ST_AsGeoJSON({{ geom_column }})::JSON,
            'properties', json_object({{ props | join(', ') }})
        )
    )
) AS geojson
FROM {{ ref(table) }}
{% endmacro %}
