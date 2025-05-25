SELECT distinct postal_code FROM {{ ref('al_list') }} AS al
WHERE NOT EXISTS (
    SELECT 1
    FROM {{ ref('postcodes') }} AS p
    WHERE p.cp7 = al.postal_code
    -- postcode should be in the format '1234-567'    
)
and al.postal_code ~ '^\d{4}-\d{3}$'
    and al.postal_code is not null