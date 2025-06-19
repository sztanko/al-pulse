WITH al_localities AS (
    SELECT
        al.al_id,
        al.postal_code,
        al.locality AS al_locality,
        l.osm_id AS locality_osm_id,
        l.name AS admin_name,
        levenshtein(al.locality, l.name) AS distance,
        al.*
    FROM {{ ref("al") }} AS al
    LEFT JOIN {{ ref("admin") }} AS a ON a.admin_level = 7 AND al.municipality_osm_id = a.osm_id
    LEFT JOIN {{ ref("admin") }} AS l ON l.admin_level = 8 AND a.osm_id = l.parent_id
    WHERE locality_name IS null
),

ranked AS (
    SELECT
        al_id,
        postal_code,
        al_locality,
        locality_osm_id,
        admin_name,
        distance,
        row_number() OVER (
            PARTITION BY al_id, postal_code
            ORDER BY distance
        ) AS rn
    FROM al_localities
),

results AS (
    SELECT
        al_id,
        postal_code,
        al_locality,
        locality_osm_id,
        admin_name,
        distance
    FROM ranked
    WHERE rn = 1
)

SELECT * FROM results AS r
LEFT JOIN {{ ref('postcodes') }} AS p ON r.postal_code = p.postcode
WHERE distance > 1
