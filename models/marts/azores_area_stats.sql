{{ config(materialized='table') }}

-- Current-snapshot statistics for Azorean areas.
--
-- Deliberately *not* region_stats. That model is a monthly time series keyed on
-- registration_date, and the Azorean register has no dates at all — not stale
-- dates, no date column. Feeding it a synthesised month would put a fabricated
-- history on the site, so this stops at a cross-section: what is registered
-- now, by area, and nothing about how it got there.
--
-- Everything downstream treats an area from here as "current only":
-- area_summary carries a `has_time_series` flag, and the site refuses to draw a
-- chart for an area where it is false.
--
-- No ranks. Every rank on the site comes out of the time series, where an area
-- is ranked against the same set of areas every month; an Azorean area ranked
-- against that set today would be a different comparison from the one the rank
-- *change* beside it measures. One basis, honestly labelled, beats two bases
-- that look alike.

WITH listing AS (
    SELECT *
    FROM {{ ref('azores_al') }}
    WHERE area_match != 'unresolved'
),

-- One row per (area, listing), so a listing counts once at each level it
-- belongs to. A listing that only resolved to a concelho contributes there and
-- at region level but not to any freguesia — which is the honest outcome, not
-- a reason to guess a freguesia for it.
by_area AS (
    SELECT
        locality_osm_id AS area_id,
        rooms
    FROM listing
    WHERE locality_osm_id IS NOT NULL

    UNION ALL

    SELECT
        municipality_osm_id AS area_id,
        rooms
    FROM listing
    WHERE municipality_osm_id IS NOT NULL

    UNION ALL

    SELECT
        region_osm_id AS area_id,
        rooms
    FROM listing
),

counted AS (
    SELECT
        area_id,
        count(*) AS al_count,
        count(rooms) AS rooms_known,
        count(*) FILTER (WHERE rooms = 0) AS rooms_0,
        count(*) FILTER (WHERE rooms = 1) AS rooms_1,
        count(*) FILTER (WHERE rooms = 2) AS rooms_2,
        count(*) FILTER (WHERE rooms = 3) AS rooms_3,
        count(*) FILTER (WHERE rooms > 3) AS rooms_more_than_3
    FROM by_area
    GROUP BY area_id
),

-- OSM tags no population on the Açores region polygon, so it is summed from
-- the municipalities rather than left null — otherwise the region page would
-- show a population-derived measure as missing when the numbers to compute it
-- are right there.
population AS (
    SELECT
        a.osm_id,
        -- Cast back to INTEGER: DuckDB's sum() returns HUGEINT, which survives
        -- the UNION in localities_with_data_for_geojson and promotes the whole
        -- column. GDAL then refuses to write it ("for decimal field, only
        -- precision up to 19 is supported") and the GeoJSON export fails — for
        -- a population of four hundred thousand.
        CAST(
            CASE
                WHEN a.osm_id = {{ var('azores_region_osm_id') }}
                    THEN (
                        SELECT sum(m.population)
                        FROM {{ ref('admin') }} AS m
                        WHERE m.parent_id = {{ var('azores_region_osm_id') }}
                    )
                ELSE a.population
            END AS INTEGER
        ) AS population
    FROM {{ ref('admin') }} AS a
)

SELECT
    a.osm_id AS area_id,
    a.slug AS area_slug,
    a.name AS area_name,
    a.full_name,
    a.admin_type,
    c.al_count,
    p.population,
    CASE
        WHEN p.population > 0 THEN round(c.al_count * 1000.0 / p.population, 4)
    END AS al_per_1000,
    CASE
        WHEN c.al_count > 0 AND p.population > 0
            THEN round(p.population * 1.0 / c.al_count, 2)
    END AS inhabitants_per_al,
    c.rooms_known,
    -- Shares, on the listings whose room count is known. A listing with no
    -- room count is absent from the denominator rather than counted as zero
    -- rooms, which would invent a category the register never recorded.
    CASE WHEN c.rooms_known > 0 THEN c.rooms_0 * 1.0 / c.rooms_known END AS rooms_0,
    CASE WHEN c.rooms_known > 0 THEN c.rooms_1 * 1.0 / c.rooms_known END AS rooms_1,
    CASE WHEN c.rooms_known > 0 THEN c.rooms_2 * 1.0 / c.rooms_known END AS rooms_2,
    CASE WHEN c.rooms_known > 0 THEN c.rooms_3 * 1.0 / c.rooms_known END AS rooms_3,
    CASE
        WHEN c.rooms_known > 0 THEN c.rooms_more_than_3 * 1.0 / c.rooms_known
    END AS rooms_more_than_3
FROM counted AS c
INNER JOIN {{ ref('admin') }} AS a ON c.area_id = a.osm_id
LEFT JOIN population AS p ON a.osm_id = p.osm_id
ORDER BY a.admin_type, a.name
