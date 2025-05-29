WITH
result AS (
    SELECT
        al.postal_code,
        count(*) AS num_properties
    FROM {{ ref('stg_al_list') }} AS al
    WHERE (
        NOT EXISTS (
            SELECT 1
            FROM {{ ref('stg_postal_codes_raw') }} AS p
            WHERE p.cp7 = al.postal_code
        -- postcode should be in the format '1234-567'    
        )
        AND NOT EXISTS (
            SELECT 1
            FROM {{ ref('stg_postal_codes_invalid') }} AS pci
            WHERE pci.postal_code = al.postal_code
        )
        AND NOT EXISTS (
            SELECT 1
            FROM {{ ref('stg_postal_code_lookup') }} AS pcl
            WHERE pcl.query_postcode = al.postal_code
        )
        AND al.postal_code ~ '^\d{4}-\d{3}$'
        AND al.postal_code IS NOT null
        -- doesn't end with 000
        AND al.postal_code !~ '000$'
    )
    OR EXISTS (
        SELECT 1 FROM {{ ref('duplicate_postcodes') }} AS dp
        WHERE dp.postcode = al.postal_code
    )
    GROUP BY 1
    ORDER BY 2 DESC
)

SELECT * FROM result
