WITH duplicate_municipalities AS (
    SELECT
        municipality,
        count(DISTINCT district) AS count_districts
    FROM {{ ref("al_unmapped") }}
    GROUP BY municipality
    HAVING count(DISTINCT district) > 1
)

SELECT
    municipality,
    district,
    count(*)
FROM {{ ref("al_unmapped") }}
WHERE municipality IN (SELECT municipality FROM duplicate_municipalities)
GROUP BY 1, 2

ORDER BY municipality
