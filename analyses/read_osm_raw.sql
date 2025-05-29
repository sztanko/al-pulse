SELECT distinct highway
-- FROM ST_ReadOSM('downloads/osm/portugal-latest.osm.pbf') 
--from 'files/portugal-latest_nofilter_noclip_compact_sorted.parquet'
FROM st_read({{ source("geojson", "roads") }})
where highway in ('secondary', 'tertiary', 'residential', 'unclassified', 'trun')
-- where "addr:postcode" ~ '\d{4}-\d{3}'
-- st_read('downloads/osm/boundaries.geojson')
-- where osm_id='1629145'
-- where name like '%Madeira%'
-- where feature_id like  '%/1629145'
-- where tags['admin_level'] = '4' and tags['name'] like '%Madeira%'