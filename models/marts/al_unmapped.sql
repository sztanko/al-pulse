{{
    config(
        materialized='table',
        post_hook='CREATE INDEX IF NOT EXISTS idx_al_geom ON {{ this }} USING RTREE(geom)',
        pre_hook='DROP INDEX IF EXISTS idx_al_geom'
    )
}}

-- This is a list of AL-s, but without mapping to 


WITH last_etl AS (
    SELECT max(etl_timestamp) AS last_etl
    FROM {{ ref('stg_al_list') }}
),

latest_data AS (
    SELECT
        al_id,
        registration_number,
        registration_date,
        lodging_name AS name,
        is_building_post_1951,
        public_opening_date AS opening_date,
        house_type,
        beds,
        max_guests,
        rooms,
        address,
        postal_code,
        locality,
        municipality,
        district,
        operator_name,
        operator_quality,
        operator_type,
        email,
        etl_timestamp = absolute_latest.last_etl AS is_active,
        CASE
            WHEN etl_timestamp = absolute_latest.last_etl THEN NULL
            ELSE last_etl
        END AS closed_moonth
    FROM {{ ref('stg_al_list') }}
    CROSS JOIN last_etl AS absolute_latest
)

SELECT
    ld.*,
    ps.geom,
    ps.real_postcode
FROM latest_data AS ld
LEFT JOIN {{ ref('postcodes') }} AS ps
    ON ld.postal_code = ps.postcode
