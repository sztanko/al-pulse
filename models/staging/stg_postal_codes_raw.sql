WITH source_data AS (

    SELECT
        cast(id AS integer) AS id,
        cast(cdistrito AS integer) AS district_code,
        cast(cconcelho AS integer) AS municipality_code,
        cast(clocalidade AS integer) AS locality_code,

        capitalize(trim(distrito)) AS district,
        capitalize(trim(concelho)) AS municipality,
        capitalize(trim(localidade)) AS locality,

        trim(carteria) AS artery_code,
        trim(mortipo) AS street_type,
        trim(mor1preposicao) AS preposition_1,
        trim(mortitulo) AS title,
        trim(mor2preposicao) AS preposition_2,
        capitalize(trim(mordesignacao)) AS street_name,
        capitalize(trim(morlocal)) AS location,
        trim(cliente) AS client,
        capitalize(trim(morada)) AS address,
        trim(mortroco) AS street_section,
        trim(porta) AS door_number,

        cast(cp4 AS integer) AS cp4,
        cast(cp3 AS integer) AS cp3,
        trim(cpalfa) AS cp_alpha,
        lower(trim(cp7)) AS cp7,
        capitalize(trim(codigopostal)) AS full_postal_code,

        cast(long AS double) AS lng,
        cast(lat AS double) AS lat

    FROM {{ source('raw', 'postal_codes_raw') }}
    WHERE trim(cp7) ~ '^\d{4}-\d{3}$'

)

SELECT * FROM source_data
WHERE
    TRUE
