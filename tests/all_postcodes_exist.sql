SELECT *
FROM {{ ref("al") }}
WHERE
    postal_code NOT IN (SELECT postcode FROM {{ ref("postcodes") }})
    AND postal_code
    NOT IN (SELECT ip.postal_code FROM {{ ref("stg_postal_codes_invalid") }} AS ip)
