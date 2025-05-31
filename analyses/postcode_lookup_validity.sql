with duplicate_locations as (
select lat, lng, count(distinct query_postcode) as num_postcodes from {{ref("stg_postal_code_lookup")}}
where lat is not null
group by 1, 2
having count(distinct query_postcode) > 1
),

top_location as (
select lat, lng, num_postcodes, ROW_NUMBER() over( order by num_postcodes desc) as nr
from duplicate_locations
)

select * from {{ref("stg_postal_code_lookup")}}
where (lat, lng) in (select tp.lat, tp.lng from top_location tp where tp.nr=1)
order by postcode


