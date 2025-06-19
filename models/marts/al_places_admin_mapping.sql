WITH

admin_places AS (
    SELECT
        a.admin_type AS type,
        a.name,
        a.parent_name,
        a2.parent_name AS grandpa,
        a.parent_path,
        a.osm_id,
        a.geom
    FROM {{ ref('admin') }} AS a
    LEFT JOIN {{ ref('admin') }} AS a2
        ON a.parent_id = a2.osm_id
    WHERE a.admin_level IN ('4', '6', '7', '8')
),

al_regions AS (
    SELECT DISTINCT
        al.district AS name,
        r.name IS NOT null AS is_match,
        'Portugal' AS parent_name,
        '' AS grandpa,
        osm_id,
        r.name AS matched_name
    FROM {{ ref('al_unmapped') }} AS al
    LEFT JOIN admin_places AS r
        ON
            lower(strip_accents(al.district)) = lower(strip_accents(r.name))
    WHERE (r.type = 'region' OR r.type IS null)

),

al_municipalities AS (
    SELECT DISTINCT
        al.municipality AS name,
        r.name IS NOT null AS is_match,
        al.district AS parent_name,
        '' AS grandpa,
        osm_id,
        r.name AS matched_name
    FROM {{ ref('al_unmapped') }} AS al
    LEFT JOIN admin_places AS r
        ON
            lower(strip_accents(al.municipality)) = lower(strip_accents(r.name))
            AND lower(strip_accents(al.district)) = lower(strip_accents(r.parent_name))
    WHERE (r.type = 'municipality' OR r.type IS null)
),

al_localities AS (
    SELECT DISTINCT
        al.locality AS name,
        al.municipality AS parent_name,
        l.name IS NOT null AS is_match,
        l.grandpa,
        osm_id,
        l.name AS matched_name
    FROM {{ ref('al_unmapped') }} AS al
    LEFT JOIN admin_places AS l
        ON
            lower(strip_accents(al.locality)) = lower(strip_accents(l.name))
            AND lower(strip_accents(al.municipality)) = lower(strip_accents(l.parent_name))
            AND lower(strip_accents(al.district)) = lower(strip_accents(l.grandpa))
    WHERE (l.type = 'locality' OR l.type IS null)
),

all_al_places AS (
    SELECT
        'region' AS type,
        name,
        parent_name,
        grandpa,
        is_match,
        osm_id,
        matched_name
    FROM al_regions
    UNION ALL
    SELECT
        'municipality' AS type,
        name,
        parent_name,
        grandpa,
        is_match,
        osm_id,
        matched_name
    FROM al_municipalities
    UNION ALL
    SELECT
        'locality' AS type,
        name,
        parent_name,
        grandpa,
        is_match,
        osm_id,
        matched_name
    FROM al_localities

),

al_by_geom AS (
    SELECT
        aap.type,
        CASE
            WHEN aap.type = 'region' THEN al.district
            WHEN aap.type = 'municipality' THEN al.municipality
            WHEN aap.type = 'locality' THEN al.locality
        END AS name,
        CASE
            WHEN aap.type = 'region' THEN 'Portugal'
            WHEN aap.type = 'municipality' THEN al.district
            WHEN aap.type = 'locality' THEN al.municipality
        END AS parent_name,
        CASE
            WHEN aap.type = 'region' THEN ''
            WHEN aap.type = 'municipality' THEN ''
            WHEN aap.type = 'locality' THEN al.district
        END AS grandpa,
        al.geom,
        count(*) AS num_props
    FROM {{ ref('al_unmapped') }} AS al
    INNER JOIN all_al_places AS aap
        ON CASE
            WHEN aap.type = 'region' THEN lower(al.district)
            WHEN aap.type = 'municipality' THEN lower(al.municipality)
            WHEN aap.type = 'locality' THEN lower(al.locality)
        END = lower(aap.name)
        AND
        CASE
            WHEN aap.type = 'locality' THEN al.municipality
            WHEN aap.type = 'municipality' THEN al.district
            WHEN aap.type = 'region' THEN 'Portugal'
        END = aap.parent_name
        AND
        CASE
            WHEN aap.type = 'locality' THEN al.district = aap.grandpa
            ELSE true
        END
    WHERE
        NOT aap.is_match
    GROUP BY 1, 2, 3, 4, 5

),

al_st_matches AS (
    SELECT
        al.type,
        al.name,
        al.parent_name,
        al.grandpa,
        r.osm_id,
        r.name AS matched_name,
        sum(num_props) AS num_matches
    FROM al_by_geom AS al
    LEFT JOIN admin_places AS r
        ON st_contains(r.geom, al.geom)
        -- r.type = al.type
    WHERE
        true
        AND r.type = al.type
    GROUP BY 1, 2, 3, 4, 5, 6
    ORDER BY 7 DESC
),

with_rn AS (
    SELECT
        type,
        name,
        parent_name,
        grandpa,
        osm_id,
        matched_name,
        num_matches,
        row_number() OVER (
            PARTITION BY type, name
            ORDER BY num_matches DESC
        ) AS rn
    FROM al_st_matches
),

top_matches AS (
    SELECT
        type,
        name,
        parent_name,
        grandpa,
        osm_id,
        matched_name
        -- num_matches
    FROM with_rn
    WHERE rn = 1
),

combined AS (
    SELECT
        type,
        capitalize(name) AS name,
        capitalize(parent_name) AS parent_name,
        capitalize(grandpa) AS grandpa,
        osm_id,
        capitalize(matched_name) AS matched_name
    FROM top_matches
    UNION ALL
    SELECT
        type,
        name,
        parent_name,
        grandpa,
        osm_id,
        matched_name
    FROM all_al_places
    WHERE is_match
)

SELECT * FROM combined


-- select name, parent_name, count(1) top_matches from al_localities
-- group by name, parent_name
-- having count(1) > 1
-- 
-- SELECT * FROM combined
-- lower(name) LIKE '%funchal%'
-- AND type = 'region'
-- AND type = 'locality'
-- AND osm_id IS null
-- ORDER BY name
