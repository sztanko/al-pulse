WITH duplicated AS (
    SELECT
        type,
        name,
        parent_name,
        count(*) AS c,
        count(DISTINCT osm_id)
    FROM {{ ref('al_places_admin_mapping') }}
    GROUP BY type, name, parent_name
    HAVING count(*) > 1 OR count(DISTINCT osm_id) > 1
)

SELECT
    al.*,
    d.c
FROM {{ ref('al_places_admin_mapping') }} AS al
INNER JOIN duplicated AS d
    ON
        al.type = d.type
        AND al.name = d.name
        AND al.parent_name = d.parent_name
ORDER BY al.type, al.name, al.parent_name
