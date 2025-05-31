WITH result AS (
    SELECT *
    FROM {{ ref("clean_postcodes_api") }}
    UNION
    (
        SELECT *
        FROM {{ ref("clean_postcodes_bulk") }} AS w
        WHERE
            w.postcode
            NOT IN (SELECT cp.postcode FROM {{ ref("clean_postcodes_api") }} AS cp)
    )
)

SELECT * FROM result
