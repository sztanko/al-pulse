# Problem statement
Get the admin boundaries for Portugal, Azores and Madeira


1. Do we have this data in portugal extract?
```SELECT *
FROM ST_ReadOSM('downloads/osm/portugal-latest.osm.pbf') 
where id='1629145'
```

Yes we do.

2. 
ogr2ogr -f GeoJSON out.geojson -overwrite -where "osm_id = '1629145'" -skipfailures downloads/osm/portugal-latest.osm.pbf multipolygons