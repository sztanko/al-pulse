{{ config(materialized='table') }}

-- What the Azorean cleansing actually did, as a table you can query.
--
-- The record-level rules write a JSON report next to the CSV, but that file is
-- one pull in isolation. This model is the part that has to hold up over time:
-- it is rebuilt on every ETL run, so a source that starts drifting — a concelho
-- renamed, coordinates dropped, the freguesia column going blank — shows up as
-- a row here moving rather than as a number quietly changing on the site.
--
-- It is also what the dbt tests assert against, which is why it reports *rates*
-- and not only counts: "412 unresolved" means nothing without the denominator.

WITH listings AS (
    SELECT * FROM {{ ref('azores_al') }}
),

total AS (
    SELECT count(*) AS n FROM listings
),

by_match AS (
    SELECT
        area_match AS metric,
        count(*) AS value
    FROM listings
    GROUP BY area_match
),

completeness AS (
    SELECT 'has_coordinates' AS metric, count(*) AS value FROM listings WHERE latitude IS NOT NULL
    UNION ALL
    SELECT 'has_rooms', count(*) FROM listings WHERE rooms IS NOT NULL
    UNION ALL
    SELECT 'has_beds', count(*) FROM listings WHERE beds IS NOT NULL
    UNION ALL
    SELECT 'has_island', count(*) FROM listings WHERE island IS NOT NULL
    UNION ALL
    SELECT 'has_house_type', count(*) FROM listings WHERE house_type IS NOT NULL
    UNION ALL
    SELECT 'has_locality', count(*) FROM listings WHERE locality_osm_id IS NOT NULL
    UNION ALL
    SELECT 'has_municipality', count(*) FROM listings WHERE municipality_osm_id IS NOT NULL
    UNION ALL
    -- The register reuses an RRAL number occasionally. The Python side keeps
    -- both rows on purpose (dropping one would delete a real establishment);
    -- this counts how often it happens so it stays visible.
    SELECT 'duplicate_rral', count(*) FROM (
        SELECT rral FROM listings WHERE rral IS NOT NULL GROUP BY rral HAVING count(*) > 1
    )
    UNION ALL
    -- Where the point and the register's own freguesia name disagree, the
    -- point wins. Worth watching: a jump here means the source's geocoding or
    -- its naming has changed, and the two rungs of the ladder have parted.
    SELECT 'point_disagrees_with_name', count(*)
    FROM listings AS li
    INNER JOIN {{ ref('admin') }} AS loc ON li.locality_osm_id = loc.osm_id
    WHERE
        li.area_match = 'point'
        AND li.locality_raw IS NOT NULL
        AND {{ fold('li.locality_raw') }} != {{ fold('loc.name') }}
)

SELECT
    'match:' || metric AS metric,
    value,
    round(value * 100.0 / (SELECT n FROM total), 2) AS pcnt_of_listings,
    (SELECT n FROM total) AS listings
FROM by_match

UNION ALL

SELECT
    'completeness:' || metric AS metric,
    value,
    round(value * 100.0 / (SELECT n FROM total), 2) AS pcnt_of_listings,
    (SELECT n FROM total) AS listings
FROM completeness

ORDER BY metric
