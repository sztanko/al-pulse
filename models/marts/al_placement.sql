{{ config(materialized='table') }}

-- Which area each registration belongs to, and why we think so.
--
-- One row per registration ever seen, current or lost, so the stock and the
-- losses are placed by the same rule and a licence can never be subtracted
-- from an area that never counted it.
--
-- In order of trust:
--   point       a geocoded point good to about a kilometre or better
--               (geocode_confidence high or medium), placed by polygon;
--   name        the register's own locality and municipality names, matched
--               to OSM;
--   rough_point a coarser geocoded point (a whole postcode area), by polygon;
--   municipality only the municipality could be matched by name — counted
--               there and nationally, in no locality;
--   unplaced    nothing matched — counted nationally only.
--
-- Point before name, deliberately: the register's freguesia names are often
-- the pre-2013 ones ("Buarcos (Extinta)") or abbreviated past matching
-- ("Cedofeita,Ildefonso,Sé,…"), while a point at a door has no such problem.
-- Nothing is dropped here. A registration that cannot be placed is still a
-- registration, and the national total must include it.

WITH listings AS (
    SELECT al_id, locality, municipality, district
    FROM {{ ref('stg_al_list') }}
),

geocoded AS (
    SELECT * FROM {{ ref('stg_al_geocoded') }}
),

point_locality AS (
    SELECT g.al_id, l.osm_id AS locality_osm_id, g.geocode_confidence
    FROM geocoded AS g
    INNER JOIN {{ ref('admin') }} AS l
        ON l.admin_type = 'locality' AND st_contains(l.geom, g.geom)
    WHERE g.geom IS NOT null
    QUALIFY row_number() OVER (PARTITION BY g.al_id ORDER BY st_area(l.geom)) = 1
),

name_locality AS (
    SELECT li.al_id, l.osm_id AS locality_osm_id
    FROM listings AS li
    INNER JOIN {{ ref('admin') }} AS l
        ON
            lower(strip_accents(li.locality)) = lower(strip_accents(l.name))
            AND l.admin_type = 'locality'
            AND lower(strip_accents(li.municipality)) = lower(strip_accents(l.parent_name))
    INNER JOIN {{ ref('admin') }} AS mm
        ON
            lower(strip_accents(li.municipality)) = lower(strip_accents(mm.name))
            AND mm.admin_type = 'municipality'
            AND lower(strip_accents(li.district)) = lower(strip_accents(mm.parent_name))
    QUALIFY row_number() OVER (PARTITION BY li.al_id ORDER BY l.osm_id) = 1
),

name_municipality AS (
    SELECT li.al_id, mm.osm_id AS municipality_osm_id
    FROM listings AS li
    INNER JOIN {{ ref('admin') }} AS mm
        ON
            lower(strip_accents(li.municipality)) = lower(strip_accents(mm.name))
            AND mm.admin_type = 'municipality'
            AND lower(strip_accents(li.district)) = lower(strip_accents(mm.parent_name))
    QUALIFY row_number() OVER (PARTITION BY li.al_id ORDER BY mm.osm_id) = 1
),

chosen AS (
    SELECT
        li.al_id,
        CASE
            WHEN pl.geocode_confidence IN ('high', 'medium') THEN pl.locality_osm_id
            WHEN nl.locality_osm_id IS NOT null THEN nl.locality_osm_id
            ELSE pl.locality_osm_id
        END AS locality_osm_id,
        CASE
            WHEN pl.geocode_confidence IN ('high', 'medium') THEN 'point'
            WHEN nl.locality_osm_id IS NOT null THEN 'name'
            WHEN pl.locality_osm_id IS NOT null THEN 'rough_point'
            WHEN nm.municipality_osm_id IS NOT null THEN 'municipality'
            ELSE 'unplaced'
        END AS placement_method,
        nm.municipality_osm_id AS named_municipality_osm_id
    FROM listings AS li
    LEFT JOIN point_locality AS pl ON li.al_id = pl.al_id
    LEFT JOIN name_locality AS nl ON li.al_id = nl.al_id
    LEFT JOIN name_municipality AS nm ON li.al_id = nm.al_id
)

SELECT
    c.al_id,
    c.placement_method,
    l.name AS locality_name,
    l.osm_id AS locality_osm_id,
    m.name AS municipality_name,
    m.osm_id AS municipality_osm_id,
    r.name AS region_name,
    r.osm_id AS region_osm_id
FROM chosen AS c
LEFT JOIN {{ ref('admin') }} AS l
    ON c.locality_osm_id = l.osm_id AND l.admin_type = 'locality'
LEFT JOIN {{ ref('admin') }} AS m
    ON coalesce(l.parent_id, c.named_municipality_osm_id) = m.osm_id
    AND m.admin_type = 'municipality'
LEFT JOIN {{ ref('admin') }} AS r ON m.parent_id = r.osm_id AND r.admin_type = 'region'
