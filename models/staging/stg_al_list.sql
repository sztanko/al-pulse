WITH source AS (

    SELECT * FROM {{ source('raw', 'al_raw_data') }}

),

renamed AS (

    SELECT
        etl_timestamp,

        regexp_replace("Nº de registo", '/AL$', '') AS al_id,
        "Nº de registo" AS registration_number,

        "Data do registo"::date AS registration_date,
        "Nome do Alojamento" AS lodging_name,

        CASE
            WHEN "Imóvel posterior a 1951" = 'S' THEN true
            WHEN "Imóvel posterior a 1951" = 'N' THEN false
        END AS is_building_post_1951,

        "Data Abertura Público"::date AS public_opening_date,
        modalidade AS modality,
        "Nº Camas"::integer AS beds,
        "Nº Utentes"::integer AS max_guests,
        "Nº Quartos"::integer AS rooms,
        "Nº Beliches"::integer AS bunk_beds,

        "Localização (Endereço)" AS address,
        "Localização (Código postal)" AS postal_code,
        "Localização (Localidade)" AS locality,
        "Localização (Freguesia)" AS parish,
        "Localização (Concelho)" AS municipality,
        "Localização (Distrito)" AS district,
        "NUTT II" AS region_nuts_ii,

        "Nome do Titular da Exploração" AS operator_name,
        "Titular Qualidade" AS operator_quality,
        contribuinte::bigint AS taxpayer_id,
        "Titular Tipo" AS operator_type,
        "Titular País" AS operator_country,

        "Contacto Telefone" AS phone,
        "Contacto Fax" AS fax,
        "Contacto Telemovel" AS mobile,
        "Contacto Email" AS email

    FROM source

)

SELECT * FROM renamed
