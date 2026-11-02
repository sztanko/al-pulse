{% macro data_through_month() %}
    {#-
      The last month the data covers completely: the month the latest pull
      closes (models/marts/al_pulls.sql), as a DATE.

      The refresh runs on the 2nd, so on 2 November the data is complete
      through October and November has barely begun. Everything the site
      shows stops here: registrations dated after it wait for the next pull
      to close their month, and the latest pull's losses are filed under it.
    -#}
    (SELECT CAST(max(closes_month) || '-01' AS DATE) FROM {{ ref('al_pulls') }})
{% endmacro %}
