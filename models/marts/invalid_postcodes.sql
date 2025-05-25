SELECT
    al.postal_code,
    count(*) AS num_properties
FROM {{ ref('al_list') }} AS al
WHERE
    NOT EXISTS (
        SELECT 1
        FROM {{ ref('postcodes') }} AS p
        WHERE p.cp7 = al.postal_code
    -- postcode should be in the format '1234-567'    
    )
    AND al.postal_code ~ '^\d{4}-\d{3}$'
    AND al.postal_code IS NOT null
    -- doesn't end with 000
    AND al.postal_code !~ '000$'
GROUP BY 1
ORDER BY 2 DESC
