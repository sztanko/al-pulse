{{
    config(
        materialized='table'
    )
}}

-- Identifies AL listings that "lost their license" (present in month N but not in month N+1)
-- A lost license is attributed to the month when it first disappeared

WITH all_timestamps AS (
    -- Get all distinct scrape timestamps and derive year-month
    SELECT DISTINCT
        etl_timestamp,
        strftime(etl_timestamp, '%Y-%m') AS year_month,
        lead(etl_timestamp) OVER (ORDER BY etl_timestamp) AS next_timestamp
    FROM {{ ref('stg_al_list') }}
),

al_presence_by_month AS (
    -- For each AL and timestamp, mark its presence
    SELECT
        al.al_id,
        al.registration_number,
        al.registration_date,
        al.house_type,
        al.is_building_post_1951,
        al.beds,
        al.max_guests,
        al.rooms,
        al.postal_code,
        al.locality,
        al.municipality,
        al.district,
        ts.etl_timestamp,
        ts.year_month,
        ts.next_timestamp
    FROM all_timestamps AS ts
    INNER JOIN {{ ref('stg_al_list') }} AS al
        ON al.etl_timestamp = ts.etl_timestamp
    WHERE ts.next_timestamp IS NOT null -- Exclude the most recent month (no "next" to compare)
),

al_in_next_month AS (
    -- Check if each AL also appears in the next month
    SELECT
        prev.al_id,
        prev.etl_timestamp,
        prev.next_timestamp,
        CASE
            WHEN next_als.al_id IS null THEN 1
            ELSE 0
        END AS lost_license
    FROM al_presence_by_month AS prev
    LEFT JOIN {{ ref('stg_al_list') }} AS next_als
        ON prev.al_id = next_als.al_id
        AND prev.next_timestamp = next_als.etl_timestamp
),

lost_licenses_with_details AS (
    -- Get full details for ALs that lost their license, attributed to the month they disappeared
    SELECT
        al.al_id,
        al.registration_number,
        al.registration_date,
        al.house_type,
        al.is_building_post_1951,
        al.beds,
        al.max_guests,
        al.rooms,
        al.postal_code,
        al.locality,
        al.municipality,
        al.district,
        strftime(ll.next_timestamp, '%Y-%m') AS lost_in_year_month,
        ll.next_timestamp AS lost_in_timestamp
    FROM al_in_next_month AS ll
    INNER JOIN {{ ref('stg_al_list') }} AS al
        ON ll.al_id = al.al_id
        AND ll.etl_timestamp = al.etl_timestamp
    WHERE ll.lost_license = 1
)

SELECT * FROM lost_licenses_with_details
