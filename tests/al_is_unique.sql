SELECT
    al_id,
    count(*)
FROM {{ ref('al') }}
GROUP BY al_id
HAVING count(*) > 1
ORDER BY al_id
