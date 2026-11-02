{% macro latest_month() %}
    {#-
      The month every "now" figure is taken at: the month the data runs
      through (see data_through_month), as a DATE.

      Never `date_trunc('month', current_date)`. The 2 November 2026 deploy
      asked for November, which no row of the series had, and the map lost
      every national locality. The calendar month is also the wrong month
      to report: on the 2nd it holds a day or two of registrations, and a
      pull taken then closes the month before.
    -#}
    {{ data_through_month() }}
{% endmacro %}
