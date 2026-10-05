-- Every registration on the national register reaches `al`, placed or not.
--
-- Until 2026-10 `al` silently discarded anything it could not put in a region:
-- 4,246 active registrations, missing from every area *and* from the national
-- total, while the method page said they were counted nationally. The only
-- registrations allowed to be missing are Azorean ones, which are counted from
-- the regional register instead.
SELECT u.al_id, u.postal_code, u.municipality, u.district
FROM {{ ref('al_unmapped') }} AS u
LEFT JOIN {{ ref('al') }} AS a ON u.al_id = a.al_id
LEFT JOIN {{ ref('al_placement') }} AS p ON u.al_id = p.al_id
WHERE
    a.al_id IS null
    AND p.region_osm_id IS DISTINCT FROM {{ var('azores_region_osm_id') }}
    AND NOT (p.region_osm_id IS null AND u.district = 'Açores')
