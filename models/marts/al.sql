WITH full_mapping AS (
    SELECT
        al.*,
        coalesce(a.name, ip.locality, ips.locality, geo.name) AS locality_name,
        coalesce(a.osm_id, ips.locality_osm_id, geo.osm_id) AS locality_osm_id,
        coalesce(mm.matched_name, apm.name, gm.name) AS municipality_name,
        coalesce(mm.osm_id, apm.osm_id, gm.osm_id) AS municipality_osm_id,
        coalesce(mr.matched_name, apd.name, gmd.name) AS region_name,
        coalesce(mr.osm_id, apd.osm_id, gmd.osm_id) AS region_osm_id
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
    LEFT JOIN {{ ref('invalid_postcode_similarities') }} AS ips ON al.postal_code = ips.postcode
    LEFT JOIN admin AS apd ON apd.admin_level IN (6, 4) AND al.district = apd.name
    LEFT JOIN admin AS apm ON apm.admin_level = '7' AND al.municipality = apm.name AND apd.osm_id = apm.parent_id
    LEFT JOIN admin AS a ON a.admin_level = '8' AND al.locality = a.name AND apm.osm_id = a.parent_id
    LEFT JOIN admin AS geo ON geo.admin_level = '8' AND st_contains(geo.geom, ip.geom)
    LEFT JOIN admin AS gm ON gm.admin_level = '7' AND geo.parent_id = gm.osm_id
    LEFT JOIN admin AS gmd ON gmd.admin_level IN (6, 4) AND gm.parent_id = gmd.osm_id

)

SELECT * FROM full_mapping
