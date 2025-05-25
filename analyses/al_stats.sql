select year(registration_date) , count(1) as num_properties
from {{ ref("stg_al_list") }}
group by 1
order by 1;
