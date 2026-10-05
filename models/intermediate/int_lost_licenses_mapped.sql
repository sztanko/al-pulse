{{
    config(
        materialized='table'
    )
}}

-- Places lost licences in areas with the same rule as the current stock
-- (al_placement, keyed by registration), so a licence is only ever
-- subtracted from the area that counted it.
SELECT
    ll.*,
    p.placement_method,
    p.locality_name,
    p.locality_osm_id,
    p.municipality_name,
    p.municipality_osm_id,
    p.region_name,
    p.region_osm_id
FROM {{ ref('int_lost_licenses') }} AS ll
INNER JOIN {{ ref('al_placement') }} AS p ON ll.al_id = p.al_id
WHERE
    -- The Azores keep their own register (see models/marts/azores_al.sql);
    -- this one is national and carries only a fraction of them.
    p.region_osm_id IS DISTINCT FROM {{ var('azores_region_osm_id') }}
    AND NOT (p.region_osm_id IS null AND ll.district = 'Açores')
