-- List of codes that we need, that need to be looked up
WITH
bulk_postcodes AS ( -- get list of all postcodes that we have
    SELECT DISTINCT postal_code FROM {{ ref('stg_al_list') }}
    UNION
    SELECT DISTINCT cp7 AS postal_code FROM {{ ref('stg_postal_codes_raw') }}
),

result AS (
    SELECT
        al.postal_code,
        count(*) AS num_properties
    FROM bulk_postcodes AS p
    LEFT JOIN
        {{ ref('stg_al_list') }} AS al
        ON p.postal_code = al.postal_code
    WHERE (
        NOT EXISTS (
            SELECT 1
            FROM {{ ref('clean_postcodes_bulk') }} AS cpb
            WHERE cpb.postcode = al.postal_code
        )
        AND NOT EXISTS (
            SELECT 1
            FROM {{ ref('stg_postal_codes_invalid') }} AS pci
            WHERE pci.postal_code = al.postal_code
        )
        AND NOT EXISTS ( -- exclude postcodes that are already have been looked up
            SELECT 1
            FROM {{ ref('stg_postal_code_lookup') }} AS pcl
            WHERE pcl.query_postcode = al.postal_code
        )
        AND al.postal_code ~ '^\d{4}-\d{3}$'
        AND al.postal_code IS NOT null
        -- doesn't end with 000
        AND al.postal_code !~ '000$'
    )
    GROUP BY 1
    ORDER BY 2 DESC
)

SELECT * FROM result
WHERE postal_code NOT LIKE '%000'
