WITH name_mapping AS (
    SELECT
        al.al_id,
        l.osm_id AS locality_osm_id
    FROM {{ ref('al_unmapped') }} AS al
    INNER JOIN {{ ref('admin') }} AS l
        ON
            lower(strip_accents(al.locality)) = lower(strip_accents(l.name))
            AND l.admin_type = 'locality'
            AND lower(strip_accents(al.municipality)) = lower(strip_accents(l.parent_name))
    INNER JOIN {{ ref('admin') }} AS mm
        ON
            lower(strip_accents(al.municipality)) = lower(strip_accents(mm.name))
            AND mm.admin_type = 'municipality'
            AND lower(strip_accents(al.district)) = lower(strip_accents(mm.parent_name))
),

postcode_mapping AS (
    SELECT
        al.al_id,
        coalesce(p.locality_id, ips.locality_osm_id) AS locality_id
    FROM {{ ref('al_unmapped') }} AS al
    LEFT JOIN
        {{ ref('postcodes') }}
            AS p
        ON al.real_postcode = p.postcode
    LEFT JOIN {{ ref('invalid_postcode_similarities') }} AS ips ON al.real_postcode = ips.postcode
),

consolidated_mapping AS (
    SELECT
        al.al_id,
        coalesce(nm.locality_osm_id, pm.locality_id) AS locality_osm_id
    FROM {{ ref('al_unmapped') }} AS al
    LEFT JOIN name_mapping AS nm ON al.al_id = nm.al_id
    LEFT JOIN postcode_mapping AS pm ON al.al_id = pm.al_id
),

full_mapping AS (
    SELECT
        al.*,
        l.name AS locality_name,
        l.osm_id AS locality_osm_id,
        m.name AS municipality_name,
        m.osm_id AS municipality_osm_id,
        d.name AS region_name,
        d.osm_id AS region_osm_id
    FROM {{ ref('al_unmapped') }} AS al
    LEFT JOIN consolidated_mapping AS cm ON al.al_id = cm.al_id
    LEFT JOIN {{ ref('admin') }} AS l ON cm.locality_osm_id = l.osm_id AND l.admin_type = 'locality'
    LEFT JOIN {{ ref('admin') }} AS m ON l.parent_id = m.osm_id AND m.admin_type = 'municipality'
    LEFT JOIN {{ ref('admin') }} AS d ON m.parent_id = d.osm_id AND d.admin_type = 'region'
)

SELECT * FROM full_mapping
