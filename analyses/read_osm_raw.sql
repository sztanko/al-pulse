SELECT 
tags['name'],
tags['populatio:date'],
tags['population'],
tags['admin_level'],
tags['border_type'],
tags['boundary'],
tags['ref:ine'],
tags
-- 
FROM ST_ReadOSM('downloads/osm/portugal-latest.osm.pbf') 
-- where admin_level='7'
--from 'files/portugal-latest_nofilter_noclip_compact_sorted.parquet'
-- FROM st_read({{ source("geojson", "roads") }})
-- where highway in ('secondary', 'tertiary', 'residential', 'unclassified', 'trun')
-- where "addr:postcode" ~ '\d{4}-\d{3}'
-- st_read('downloads/osm/boundaries.geojson')
-- where osm_id='1629145'
-- where name like '%Madeira%'
-- where feature_id like  '%/1629145'
where -- tags['admin_level'] = '4' and tags['name'] like '%Madeira%'
-- where -- id='679558513'
-- id='6363199615'
-- TRUE
kind='relation'
and 
-- id = '8421418' 
tags['admin_level'] is not null
and tags['admin_level'] <'7'
and tags['boundary']='administrative'
and tags['population'] is NOT NULL
-- and
-- (
--  tags['wikipedia'] is NULL 
-- or (
-- tags['wikipedia'] not like 'es:%'
-- and tags['wikipedia'] not like 'gl:%'
-- )
-- )
and tags['ref:ine'] is not null