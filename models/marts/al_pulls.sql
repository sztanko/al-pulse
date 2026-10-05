-- One row per pull of the national register, with the month that pull closes.
--
-- A pull is a snapshot of the register on the day it ran, but the pulls are
-- timed to close a month, not to open one: the refresh runs on the 2nd so the
-- previous month is complete plus a day for late updates. A pull on 2 October
-- is the register as of the end of September, and anything it finds missing
-- went missing in September. Filing those losses under the pull's own calendar
-- month put a month's attrition into a month that had barely started.
--
-- So a pull in the first `pull_closes_previous_month_through_day` days of a
-- month closes the previous month; any later pull closes its own. The manual
-- pulls before the timer existed are scattered (the 3rd, the 7th, the 11th,
-- the 16th), and the rule reads each of them the way it was meant.
--
-- Two pulls can close the same month (2026-09-16 and 2026-10-02 both close
-- September). That is fine for counting losses; anything that wants the set of
-- observed months must take the distinct `closes_month`.

SELECT
    etl_timestamp,
    CAST(etl_timestamp AS DATE) AS pulled_on,
    strftime(
        CASE
            WHEN day(etl_timestamp) <= {{ var('pull_closes_previous_month_through_day') }}
                THEN etl_timestamp - INTERVAL 1 MONTH
            ELSE etl_timestamp
        END,
        '%Y-%m'
    ) AS closes_month
FROM (SELECT DISTINCT etl_timestamp FROM {{ source('raw', 'al_raw_data') }})
