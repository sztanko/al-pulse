---
title: Map of all localities
full_width: true
hide_breadcrumbs: true
---
<LastRefreshed/>


```sql admin_map
select *, id::int::text as osm_id from map
```

<AreaMap
    data={admin_map}
    value=c_rank
    geoJsonUrl='/admin.geojson'
    geoId="admin_id"
    areaCol="osm_id"
    height=900
    opacity=0.5
    startingLat=39
    startingLong=-9
    startingZoom=8
    colorPalette={['#7f0000', '#b30000', '#d7301f', '#ef6548', '#fc8d59', '#fdbb84', '#fdd49e', '#fee8c8', '#fff7ec']}
/>