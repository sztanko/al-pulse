WITH
non_existant_postcodes AS (
    SELECT DISTINCT postal_code AS postcode FROM {{ ref('stg_al_list') }}
    WHERE postal_code NOT IN (SELECT postcode FROM {{ ref('postcodes') }})
),

lookup_attempt AS (
    SELECT
        ne.postcode,
        vp.postcode AS valid_postcode,
        vp.locality,
        vp.region_name AS district,
        vp.municipality_name AS municipality,
        vp.lng,
        vp.lat,
        vp.is_valid,
        vp.correction_type,
        vp.real_postcode,
        vp.geom,
        abs(
            (substring(ne.postcode, 1, 4) || substring(ne.postcode, 6, 4))::int
            - (substring(vp.postcode, 1, 4) || substring(vp.postcode, 6, 4))::int
        ) AS distance
    FROM non_existant_postcodes AS ne
    INNER JOIN {{ ref('postcodes') }} AS vp
        ON substring(ne.postcode, 1, 4) = substring(vp.postcode, 1, 4)
),

lookup_attempt_ranked AS (
    SELECT
        postcode,
        distance,
        locality,
        municipality,
        district,
        --lng,
        --lat,
        --is_valid,
        --correction_type,
        --real_postcode,
        geom,
        --distance,
        --valid_postcode,
        row_number() OVER (
            PARTITION BY postcode
            ORDER BY distance
        ) AS rn
    FROM lookup_attempt
)

SELECT
    lar.*,
    coalesce(a.name, geo.name) AS locality_name,
    coalesce(a.osm_id, geo.osm_id) AS locality_osm_id,
    coalesce(apm.name, gm.name) AS municipality_name,
    coalesce(apm.osm_id, gm.osm_id) AS municipality_osm_id,
    coalesce(apd.name, gmd.name) AS district_name,
    coalesce(apd.osm_id, gmd.osm_id) AS district_osm_id
FROM lookup_attempt_ranked AS lar
LEFT JOIN admin AS apd ON apd.admin_type = 'region' AND lower(strip_accents(lar.district)) = lower(strip_accents(apd.name))
LEFT JOIN
    admin AS apm
    ON apm.admin_type = 'municipality' AND lower(strip_accents(lar.municipality)) = lower(strip_accents(apm.name)) AND apd.osm_id = apm.parent_id
LEFT JOIN admin AS a ON a.admin_type = 'locality' AND lower(strip_accents(lar.locality)) = lower(strip_accents(a.name)) AND apm.osm_id = a.parent_id
LEFT JOIN admin AS geo ON geo.admin_type = 'locality' AND st_contains(geo.geom, lar.geom)
LEFT JOIN admin AS gm ON gm.admin_type = 'municipality' AND geo.parent_id = gm.osm_id
LEFT JOIN admin AS gmd ON gmd.admin_type = 'region' AND gm.parent_id = gmd.osm_id
WHERE rn = 1
ORDER BY postcode
