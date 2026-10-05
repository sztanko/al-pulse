-- Every registration on the national register, placed in an area.
--
-- Nothing is dropped for want of a place: a registration al_placement could
-- not put in a locality keeps NULL area columns and still counts nationally
-- (and in its municipality, where that was matched). The one exclusion is the
-- Azores, which keep their own register (see models/marts/azores_al.sql); this
-- one is national and carries only a fraction of them. A registration whose
-- region could not be resolved is recognised as Azorean by its district.
SELECT
    al.*,
    p.placement_method,
    p.locality_name,
    p.locality_osm_id,
    p.municipality_name,
    p.municipality_osm_id,
    p.region_name,
    p.region_osm_id
FROM {{ ref('al_unmapped') }} AS al
INNER JOIN {{ ref('al_placement') }} AS p ON al.al_id = p.al_id
WHERE
    p.region_osm_id IS DISTINCT FROM {{ var('azores_region_osm_id') }}
    AND NOT (p.region_osm_id IS null AND al.district = 'Açores')
