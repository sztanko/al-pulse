with 
top_duplicate_postcode as (

select lat, lng from {{ ref("postcodes") }}
where postcode='8200-385'
)

select * from {{ ref("postcodes") }}
where (lat, lng) in (select dp.lat, dp.lng from top_duplicate_postcode dp)
order by postcode
