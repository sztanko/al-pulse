WITH full_mapping AS (
    SELECT
        al.*,
        -- ip.locality_id AS locality_osm_id,
        ip.locality AS locality_name,
        mm.osm_id AS municipality_osm_id,
        mm.matched_name AS municipality_name,
        mr.osm_id AS region_osm_id,
        mr.matched_name AS region_name
    FROM {{ ref('al_unmapped') }} AS al
    LEFT JOIN {{ ref('al_places_admin_mapping') }} AS ml
        ON
            al.locality = ml.name AND ml.type = 'locality' AND al.municipality = ml.parent_name
            AND lower(al.district) = lower(ml.grandpa)
    LEFT JOIN {{ ref('al_places_admin_mapping') }} AS mm
        ON
            al.municipality = mm.name AND mm.type = 'municipality' AND al.district = mm.parent_name
    LEFT JOIN {{ ref('al_places_admin_mapping') }} AS mr
        ON
            al.district = mr.name AND mr.type = 'region'
    LEFT JOIN
        {{ ref('postcodes') }}
            AS ip
        ON al.postal_code = ip.postcode
)

SELECT * FROM full_mapping

WHERE TRUE
-- and municipality_name = 'Funchal'
-- and locality_name is null 

-- where locality='Funchal'
