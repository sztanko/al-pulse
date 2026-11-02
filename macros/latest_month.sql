{% macro latest_month() %}
    {#-
      The latest month in the monthly series, as a DATE.

      Not `date_trunc('month', current_date)`: the calendar month exists in the
      series only once something is registered in it. The 2 November 2026
      refresh ran before any November registration had been published, so
      "this month" matched no row, every national locality fell out of
      localities_with_data_for_geojson, and the deploy failed with 152
      features (the Azorean ones) where thousands were expected. Whatever day
      the build runs on, this is the month the data actually reaches.
    -#}
    (SELECT max(year_month) FROM {{ ref('region_stats_per_metric') }})
{% endmacro %}
