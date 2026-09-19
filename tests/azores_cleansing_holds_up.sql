-- Quality gates on the Azorean cleansing, asserted every ETL run.
--
-- scripts/fetch_azores.py gates the *pull*; this gates what survives the join
-- to the administrative hierarchy, which is where the interesting failures are.
-- The rates are deliberately looser than what the source currently achieves
-- (99.4% resolved by point, nothing unresolved) — a test that fires on normal
-- month-to-month variation gets muted, and a muted test guards nothing. These
-- fire when something has genuinely changed: the coordinates stopped arriving,
-- the concelho names were rewritten, the register halved.
--
-- Each row returned names one gate and what it saw.

WITH listings AS (
    SELECT * FROM {{ ref('azores_al') }}
),

stats AS (
    SELECT
        count(*) AS n,
        count(*) FILTER (WHERE area_match = 'unresolved') AS unresolved,
        count(*) FILTER (WHERE locality_osm_id IS NULL) AS no_locality,
        count(*) FILTER (WHERE municipality_osm_id IS NULL) AS no_municipality,
        count(*) FILTER (WHERE latitude IS NOT NULL) AS with_coords
    FROM listings
),

reconciliation AS (
    SELECT
        (SELECT al_count FROM {{ ref('azores_area_stats') }} WHERE admin_type = 'region') AS region_total,
        (SELECT sum(al_count) FROM {{ ref('azores_area_stats') }} WHERE admin_type = 'municipality') AS municipality_total,
        (SELECT sum(al_count) FROM {{ ref('azores_area_stats') }} WHERE admin_type = 'locality') AS locality_total
)

SELECT 'too_few_listings' AS gate, n::VARCHAR AS observed
FROM stats WHERE n < 3000

UNION ALL
SELECT 'unresolved_over_1pct', (unresolved * 100.0 / n)::VARCHAR
FROM stats WHERE unresolved * 1.0 / n > 0.01

UNION ALL
SELECT 'no_municipality_over_1pct', (no_municipality * 100.0 / n)::VARCHAR
FROM stats WHERE no_municipality * 1.0 / n > 0.01

UNION ALL
SELECT 'no_locality_over_5pct', (no_locality * 100.0 / n)::VARCHAR
FROM stats WHERE no_locality * 1.0 / n > 0.05

UNION ALL
-- Coordinates are what makes the whole resolution work. If they stop coming,
-- name matching alone resolves barely half the register and the freguesia
-- level of the site silently empties out.
SELECT 'coordinates_under_90pct', (with_coords * 100.0 / n)::VARCHAR
FROM stats WHERE with_coords * 1.0 / n < 0.90

UNION ALL
-- The municipality totals must add up to the region exactly: every listing
-- resolves to a concelho or it is unresolved, and unresolved rows are excluded
-- from both.
SELECT
    'municipality_total_does_not_match_region',
    municipality_total::VARCHAR || ' vs ' || region_total::VARCHAR
FROM reconciliation WHERE municipality_total != region_total

UNION ALL
-- Localities may total *less* than the region — a listing that only resolved
-- to a concelho belongs to no freguesia — but never more.
SELECT
    'locality_total_exceeds_region',
    locality_total::VARCHAR || ' vs ' || region_total::VARCHAR
FROM reconciliation WHERE locality_total > region_total

UNION ALL
-- Room shares are shares. Anything that does not sum to 1 means a listing was
-- counted in two buckets or in none.
SELECT
    'room_shares_do_not_sum_to_one',
    area_slug || ' = ' || round(
        coalesce(rooms_0, 0) + coalesce(rooms_1, 0) + coalesce(rooms_2, 0)
        + coalesce(rooms_3, 0) + coalesce(rooms_more_than_3, 0), 4
    )::VARCHAR
FROM {{ ref('azores_area_stats') }}
WHERE
    rooms_known > 0
    AND abs(
        coalesce(rooms_0, 0) + coalesce(rooms_1, 0) + coalesce(rooms_2, 0)
        + coalesce(rooms_3, 0) + coalesce(rooms_more_than_3, 0) - 1
    ) > 0.0001
