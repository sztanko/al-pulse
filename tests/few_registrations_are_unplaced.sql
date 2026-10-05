{{ config(severity='warn') }}
-- A warning, not a failure: an unplaced registration is still counted. But
-- more than 1% of the current register with no area at all means the
-- geocoder or the boundaries have regressed.
SELECT
    count(*) FILTER (WHERE placement_method = 'unplaced') AS unplaced,
    count(*) AS total
FROM {{ ref('al') }}
WHERE is_active
HAVING count(*) FILTER (WHERE placement_method = 'unplaced') > 0.01 * count(*)
