{{
    config(
        materialized='table'
    )
}}

-- Maps lost licenses to geographic areas (locality, municipality, region)
-- Uses the same mapping logic as the al model

WITH lost_licenses AS (
    SELECT * FROM {{ ref('int_lost_licenses') }}
),

name_mapping AS (
    SELECT
        ll.al_id,
        l.osm_id AS locality_osm_id
    FROM lost_licenses AS ll
    INNER JOIN {{ ref('admin') }} AS l
        ON
            lower(strip_accents(ll.locality)) = lower(strip_accents(l.name))
            AND l.admin_type = 'locality'
            AND lower(strip_accents(ll.municipality)) = lower(strip_accents(l.parent_name))
    INNER JOIN {{ ref('admin') }} AS mm
        ON
            lower(strip_accents(ll.municipality)) = lower(strip_accents(mm.name))
            AND mm.admin_type = 'municipality'
            AND lower(strip_accents(ll.district)) = lower(strip_accents(mm.parent_name))
),

postcode_mapping AS (
    SELECT
        ll.al_id,
        coalesce(p.locality_id, ips.locality_osm_id) AS locality_id
    FROM lost_licenses AS ll
    LEFT JOIN
        {{ ref('postcodes') }}
            AS p
        ON ll.postal_code = p.postcode
    LEFT JOIN {{ ref('invalid_postcode_similarities') }} AS ips ON ll.postal_code = ips.postcode
),

consolidated_mapping AS (
    SELECT
        ll.al_id,
        coalesce(nm.locality_osm_id, pm.locality_id) AS locality_osm_id
    FROM lost_licenses AS ll
    LEFT JOIN name_mapping AS nm ON ll.al_id = nm.al_id
    LEFT JOIN postcode_mapping AS pm ON ll.al_id = pm.al_id
),

full_mapping AS (
    SELECT
        ll.*,
        l.name AS locality_name,
        l.osm_id AS locality_osm_id,
        m.name AS municipality_name,
        m.osm_id AS municipality_osm_id,
        d.name AS region_name,
        d.osm_id AS region_osm_id
    FROM lost_licenses AS ll
    LEFT JOIN consolidated_mapping AS cm ON ll.al_id = cm.al_id
    LEFT JOIN {{ ref('admin') }} AS l ON cm.locality_osm_id = l.osm_id AND l.admin_type = 'locality'
    LEFT JOIN {{ ref('admin') }} AS m ON l.parent_id = m.osm_id AND m.admin_type = 'municipality'
    LEFT JOIN {{ ref('admin') }} AS d ON m.parent_id = d.osm_id AND d.admin_type = 'region'
)

SELECT * FROM full_mapping
WHERE
    region_osm_id != 1629146 -- exclude Azores
    AND region_osm_id IS NOT null
