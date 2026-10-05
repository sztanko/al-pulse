-- A lost licence is filed under the month its pull closes, never the pull's
-- own calendar month when that pull ran in the first days of a month. The
-- 2 October pull's losses are September's; seeing them under October is the
-- bug this guards against. See models/marts/al_pulls.sql.
SELECT
    ll.al_id,
    ll.lost_in_timestamp,
    ll.lost_in_year_month,
    p.closes_month
FROM {{ ref('int_lost_licenses') }} AS ll
LEFT JOIN {{ ref('al_pulls') }} AS p ON ll.lost_in_timestamp = p.etl_timestamp
WHERE
    p.closes_month IS null
    OR ll.lost_in_year_month != p.closes_month
    OR (
        day(ll.lost_in_timestamp) <= {{ var('pull_closes_previous_month_through_day') }}
        AND ll.lost_in_year_month = strftime(ll.lost_in_timestamp, '%Y-%m')
    )
