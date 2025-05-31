select 
dp.postcode, count(1) 
from {{ ref("duplicate_postcodes") }} dp
left join {{ ref("stg_al_list") }} p
on p.postal_code = dp.postcode
group by 1
order by 2 desc