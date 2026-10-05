-- One row per pull of the national register, with the month that pull closes.
--
-- A pull is a snapshot of the register on the day it ran, but the pulls are
-- timed to close a month, not to open one: the refresh runs on the 2nd so the
-- previous month is complete plus a day for late updates. A pull on 2 October
-- is the register as of the end of September, and anything it finds missing
-- went missing in September.
--
-- Two rules, in order:
--
-- 1. A pull in the first `pull_closes_previous_month_through_day` days of a
--    month closes the previous month; a later pull closes its own.
--
-- 2. Each pull closes a month strictly before the next pull's. When two pulls
--    would close the same month, the earlier one steps back. The 16 September
--    2026 pull and the 2 October one both close September by rule 1; but what
--    the October pull finds missing is September's, so the September pull's
--    finds belong to the months before it — the six it had not seen since
--    March. Without this the six-month block is drawn across September too,
--    and September's own losses vanish into it. The same rule spreads the
--    late-2025 pulls (1 Oct, 8 Nov, 11 Dec, 3 Jan) over September to
--    December, one month each, instead of leaving October unobserved and
--    doubling December.
--
-- Rule 2 in closed form: number the pulls 0..n in order and months on an
-- integer scale; pull i closes  min over j >= i of (natural_j - (j - i)),
-- i.e. i + min over j >= i of (natural_j - j) — a window minimum.

WITH pulls AS (
    SELECT
        etl_timestamp,
        row_number() OVER (ORDER BY etl_timestamp) - 1 AS i,
        CASE
            WHEN day(etl_timestamp) <= {{ var('pull_closes_previous_month_through_day') }}
                THEN etl_timestamp - INTERVAL 1 MONTH
            ELSE etl_timestamp
        END AS natural_close
    FROM (SELECT DISTINCT etl_timestamp FROM {{ source('raw', 'al_raw_data') }})
),

indexed AS (
    SELECT
        *,
        year(natural_close) * 12 + month(natural_close) - 1 AS natural_index
    FROM pulls
),

stepped AS (
    SELECT
        *,
        i + min(natural_index - i) OVER (
            ORDER BY i ROWS BETWEEN CURRENT ROW AND UNBOUNDED FOLLOWING
        ) AS close_index
    FROM indexed
)

SELECT
    etl_timestamp,
    CAST(etl_timestamp AS DATE) AS pulled_on,
    printf('%04d-%02d', close_index // 12, close_index % 12 + 1) AS closes_month
FROM stepped
