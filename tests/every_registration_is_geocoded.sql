-- Every registration has a row in the geocode cache, even if that row says
-- `none`. A missing row means scripts/geocode_al.py did not run after the
-- last pull, and those registrations would be placed by name alone without
-- anyone noticing.
SELECT u.al_id
FROM {{ ref('al_unmapped') }} AS u
LEFT JOIN {{ ref('stg_al_geocoded') }} AS g ON u.al_id = g.al_id
WHERE g.al_id IS null
