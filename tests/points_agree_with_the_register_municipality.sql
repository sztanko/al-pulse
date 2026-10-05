-- A registration placed by its point must sit in the municipality the
-- register names. al_placement enforces this; the test keeps it enforced.
-- 170949/AL (Calheta) was once placed in Ribeira Brava by the average of a
-- correct INE address point and a misplaced copy 26 km away.
SELECT a.al_id, a.municipality AS register_municipality, a.municipality_name
FROM {{ ref('al') }} AS a
WHERE
    a.placement_method = 'point'
    AND lower(strip_accents(a.municipality)) <> lower(strip_accents(a.municipality_name))
