SELECT
    al_id,
    count(*)
FROM {{ ref('al_unmapped') }}
GROUP BY al_id
HAVING count(*) > 1
ORDER BY al_id
