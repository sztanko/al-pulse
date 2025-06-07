WITH base AS (
    SELECT
        al_id,
        registration_number,
        year(registration_date) AS registration_year,
        yearmonth(registration_date) AS registration_month,
        house_type,
        beds,
        max_guests,
        rooms,
        postal_code,
        locality,
        municipality,
        district
    FROM {{ ref('al') }}
    WHERE is_active = true
)

SELECT * FROM {{ ref('al') }}
WHERE region_name IS null
