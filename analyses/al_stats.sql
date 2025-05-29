select *,

ST_AsText(geom) from {{ ref("postcodes") }}

where postcode in (
    '1100-000',
    '1100-998',
    '1100-999',
    '1100-995'
    )