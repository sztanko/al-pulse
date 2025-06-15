WITH source AS (

    SELECT * FROM {{ source('raw', 'al_raw_data') }}

),

renamed AS (

    SELECT
        etl_timestamp,

        regexp_replace("Nº de registo", '/AL$', '') AS al_id,
        trim("Nº de registo") AS registration_number,

        trim("Data do registo"::text)::date AS registration_date,
        trim("Nome do Alojamento") AS lodging_name,

        CASE
            WHEN trim("Imóvel posterior a 1951") = 'S' THEN true
            WHEN trim("Imóvel posterior a 1951") = 'N' THEN false
        END AS is_building_post_1951,

        trim("Data Abertura Público"::text)::date AS public_opening_date,
        modalidade AS house_type,
        trim("Nº Camas"::text)::integer AS beds,
        trim("Nº Utentes"::text)::integer AS max_guests,
        trim("Nº Quartos"::text)::integer AS rooms,
        trim("Nº Beliches"::text)::integer AS bunk_beds,

        trim("Localização (Endereço)") AS address,
        trim("Localização (Código postal)") AS postal_code,
        trim("Localização (Localidade)") AS locality,
        trim("Localização (Freguesia)") AS parish,
        trim("Localização (Concelho)") AS municipality,
        trim("Localização (Distrito)") AS district,
        trim("NUTT II") AS region_nuts_ii,

        trim("Nome do Titular da Exploração") AS operator_name,
        trim("Titular Qualidade") AS operator_quality,
        contribuinte::bigint AS taxpayer_id,
        trim("Titular Tipo") AS operator_type,
        trim("Titular País") AS operator_country,

        trim("Contacto Telefone") AS phone,
        trim("Contacto Fax") AS fax,
        trim("Contacto Telemovel") AS mobile,
        trim("Contacto Email") AS email
    FROM source
),

capitalized AS (
    SELECT
        etl_timestamp,
        al_id,
        registration_number,
        registration_date,
        capitalize(lodging_name) AS lodging_name,
        is_building_post_1951,
        public_opening_date,
        house_type,
        beds,
        max_guests,
        rooms,
        address,
        CASE
            WHEN postal_code IS null THEN '0000-000'
            WHEN postal_code ~ '^\d{4}-\d{3}$' THEN postal_code
            WHEN postal_code ~ '^\d{4}-\d{2}$' THEN concat(postal_code, '0')
            WHEN postal_code ~ '^\d{4}$' THEN concat(postal_code, '-000')
            WHEN postal_code ~ '^\d{3}$' THEN concat(postal_code, '0-000')
            WHEN postal_code ~ '^\d{3}-\d{3}$' THEN concat('0', substring(postal_code, 1, 3), '-000')
            WHEN postal_code ~ '^\d{2}-\d{3}$' THEN concat('00', substring(postal_code, 1, 2), '-000')
            WHEN postal_code ~ '^\d{1}-\d{3}$' THEN concat('000', substring(postal_code, 1, 1), '-000')
            WHEN postal_code ~ '^\d{5}$' THEN concat(substring(postal_code, 1, 4), '-000')
            -- handle cases like postcode=3660-692,3660-692,3660-692,3660-692 - then take the first part
            WHEN postal_code ~ '^\d{4}-\d{3},.*$' THEN substring(postal_code, 1, 8)
            ELSE postal_code
        END AS postal_code,
        capitalize(locality) AS locality,
        capitalize(parish) AS parish,
        regexp_replace(capitalize(municipality), '(.*)\s+\(.*\)', '\1', 'g') AS municipality,
        CASE
            WHEN capitalize(district) = 'Ilha Da Madeira' THEN 'Madeira'
            WHEN capitalize(district) LIKE 'Ilha D%' THEN 'Açores'
            ELSE capitalize(district)
        END AS district,
        region_nuts_ii,
        operator_name,
        operator_quality,
        taxpayer_id AS tax_id, -- Use 'tax_id' for consistency with other models
        operator_type,
        operator_country,
        phone,
        fax,
        mobile,
        email,
        row_number() OVER (
            PARTITION BY al_id
            ORDER BY etl_timestamp DESC
        ) AS rownum
    FROM renamed
),

deduplicated AS (
    SELECT * FROM capitalized
    WHERE rownum = 1
)

SELECT * FROM deduplicated
