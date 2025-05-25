WITH source_data AS (

    SELECT
        etl_ts,
        trim("Nº de registo") AS registration_number,
        cast(trim("Data do registo") AS date) AS registration_date,
        trim("Nome do Alojamento") AS accommodation_name,
        trim("Imóvel posterior a 1951") AS post_1951_building,
        cast(trim("Data Abertura Público") AS date) AS public_opening_date,
        trim(modalidade) AS modality,
        cast(trim("Nº Camas") AS integer) AS num_beds,
        cast(trim("Nº Utentes") AS integer) AS num_guests,
        "Nº Quartos" AS num_rooms_raw,
        cast(trim("Nº Quartos") AS text) AS num_rooms,
        cast(nullif(trim("Nº Beliches"), '') AS integer) AS num_bunk_beds,

        trim("Localização (Endereço)") AS address,
        trim("Localização (Código postal)") AS postal_code,
        trim("Localização (Localidade)") AS locality,
        trim("Localização (Freguesia)") AS parish,
        trim("Localização (Concelho)") AS municipality,
        trim("Localização (Distrito)") AS district,
        trim("NUTT II") AS nutt_ii,

        trim("Nome do Titular da Exploração") AS owner_name,
        trim("Titular Qualidade") AS owner_quality,
        nullif(trim(contribuinte), '') AS owner_nif,
        trim("Titular Tipo") AS owner_type,
        trim("Titular País") AS owner_country,

        nullif(trim("Contacto Telefone"), '') AS contact_phone,
        nullif(trim("Contacto Fax"), '') AS contact_fax,
        nullif(trim("Contacto Telemovel"), '') AS contact_mobile,
        nullif(trim("Contacto Email"), '') AS contact_email

    FROM {{ source('raw_data', 'al_raw_data') }}
)

SELECT * FROM source_data
-- where num_rooms_raw like '%Quartos%'
