select * from {{ ref('postcodes')}}
where 
TRUE
-- AND postcode='9370-602' 
AND postcode='9370-750'
-- AND lng='-17.16027'	
-- AND lat='32.76553'