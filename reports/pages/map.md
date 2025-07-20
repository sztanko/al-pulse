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
    value=rank_within_country
    geoJsonUrl='/al-pulse/admin.geojson'
    geoId="admin_id"
    areaCol="osm_id"
    height=900
    opacity=0.4
    startingLat=39
    startingLong=-9
    startingZoom=8
    colorPalette={['#7f0000', '#b30000', '#d7301f', '#ef6548', '#fc8d59', '#fdbb84', '#fdd49e', '#fee8c8', '#fff7ec']}    
    tooltipType=click
    tooltip={[
        {id: 'full_name', fmt: 'id', showColumnName: false, valueClass: 'text-xl font-semibold'},
        {id: 'al_count', fieldClass: 'text-[grey]', valueClass: 'text-[green]'},
        {id: 'rank_within_country', fieldClass: 'text-[grey]', valueClass: 'text-[green]'},
        {id: 'people_per_al', fieldClass: 'text-[grey]', valueClass: 'text-[green]'},        
        {id: 'link', showColumnName: false, contentType: 'link', linkLabel: 'Area stats', valueClass: 'font-bold mt-1'}
    ]}
/>