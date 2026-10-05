-- Every pull closes a month strictly after the previous pull's, so no month
-- receives two pulls' losses and no block of losses is drawn over a month
-- that has its own (al_pulls, rule 2).
SELECT etl_timestamp, closes_month, prev_closes
FROM (
    SELECT
        etl_timestamp,
        closes_month,
        lag(closes_month) OVER (ORDER BY etl_timestamp) AS prev_closes
    FROM {{ ref('al_pulls') }}
)
WHERE prev_closes IS NOT null AND closes_month <= prev_closes
