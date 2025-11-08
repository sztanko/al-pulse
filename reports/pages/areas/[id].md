---
breadcrumb: "select 'Portugal > ' || parent_path || ' > ' || name as breadcrumb from admin where slug='${params.id}'"
full_width: true
hide_breadcrumbs: false
sidebar: hide
hide_sidebar: true
hide_toc: true
---

```sql admin_info
select * from admin where slug='${params.id}' limit 1
```
{#if admin_info[0].admin_type == 'locality'}
{admin_info[0].parent_name}


{/if}

```sql admin_stats
select s.*,
s.cumulative_value_c/s_2015.cumulative_value_c as growth_since_2015,
1000 / s.cumulative_value_al_per_1000 as inhabitants_per_al,
(1000 / s.cumulative_value_al_per_1000) / (1000 / s_old.cumulative_value_al_per_1000) - 1 as inhabitants_per_al_growth,
s.cumulative_value_c / nullif(s_old.cumulative_value_c, 0) - 1 as growth_c,
s.region_rank_al_per_1000 - s_old.region_rank_al_per_1000 as region_rank_al_per_1000_change,
s.region_rank_c - s_old.region_rank_c as region_rank_change_c,
s.country_rank_c - s_old.country_rank_c as country_rank_change_c,
s.municipality_rank_c - s_old.municipality_rank_c as municipality_rank_change_c,
s.country_rank_c - s_old.country_rank_c as country_rank_change_c,
s.cumulative_value_num_rooms / nullif(s_old.cumulative_value_num_rooms, 0) - 1  as num_rooms_growth,
s.cumulative_value_num_guests / nullif(s_old.cumulative_value_num_guests, 0) as num_guests_growth
 from stats s
join admin a on a.osm_id=s.area_id
join stats s_old on s.area_id=s_old.area_id and s_old.year_month = date_trunc('month', current_date - interval '3 years')
join stats s_2015 on s.area_id=s_2015.area_id and s_2015.year_month = '2015-01-01'
where a.slug='${params.id}'
AND s.year_month = date_trunc('month', current_date)
```

```sql admin_level_stats
select s.cumulative_value_c,
s.country_rank_c,
1000 / s.cumulative_value_al_per_1000 as inhabitants_per_al,
s.country_rank_al_per_1000
from stats s
join admin a on a.osm_id=s.area_id
join admin a2 on a.admin_type=a2.admin_type
where a2.slug='${params.id}'
AND s.year_month = date_trunc('month', current_date)
```

{#if admin_info[0].admin_type!='locality'}
```sql skew_data
select * from al_pulse.distribution_skew where slug='${params.id}' and threshold='50'
```
{/if}

# {admin_info[0].full_name}

{#if admin_info[0].admin_type == 'locality'}
← <a href='{admin_info[0].municipality_link}'>Back to {admin_info[0].parent_name}</a>

{:else if admin_info[0].admin_type == 'municipality'}
← <a href='{admin_info[0].region_link}'>Back to {admin_info[0].parent_name}</a>

{:else if admin_info[0].admin_type == 'region'}
← <a href='/'>Back to Main page</a>

{/if}



### Population: <Value data={admin_info[0]} column=population fmt='#,##0' />

<Grid cols=2>
<BigValue 
  title="Active Listings"
  data={admin_stats} 
  fmt="num0"
  value=cumulative_value_c
  comparison=growth_c
  comparisonFmt=pct1
  comparisonTitle="Last 3 years"
/>
<BigValue
  title="Inhabitants per AL"
  data={admin_stats}
  value=inhabitants_per_al
  comparison=inhabitants_per_al_growth
  comparisonFmt=pct1
  comparisonTitle="Last 3 years"
  />
</Grid>
<Grid cols=3>
<BigValue
  title="Rank within Country"
  data={admin_stats}
  value=country_rank_c
  comparison=country_rank_change_c
  comparisonTitle="change over last 3 years"
  />
{#if admin_info[0].admin_type!='region'}
<BigValue
  title="Within Region"
  data={admin_stats}
  value=region_rank_c
  comparison=region_rank_change_c
  comparisonTitle="change over last 3 years"
  />
  {/if}
{#if admin_info[0].admin_type=='locality'}
<BigValue
  title="Within Municipality"
  data={admin_stats}
  value=municipality_rank_c
  comparison=municipality_rank_change_c
  comparisonTitle="change over last 3 years"
  />
{/if}
</Grid>

{#if admin_info[0].admin_type!='locality'}
<Grid cols=2>
<BigValue
  title="of localities host 50% of ALs"
  data={skew_data}
  value=locality_rank_pcnt
  fmt="pct1"
  description="Percentage of localities that host 50% of all Alojamento Local properties in this area"
  />
<BigValue
  title="% live in places with half of all ALs"
  data={skew_data}
  value=total_population_pcnt
  fmt="pct1"
  description="Percentage of population that lives in localities hosting 50% of all Alojamento Local properties"
  />
</Grid>
{/if}

```sql room_distribution_data
select * from room_distribution_comparison where slug = '${params.id}'
```

## Room Distribution Analysis

<BarChart
  title="Room Distribution Comparison"
  data={room_distribution_data}
  x=name
  y=value
  series=metric_name
  type=stacked100
  swapXY=true
  xAxisTitle="Geographic Level"
  yAxisTitle="Percentage"
  sort=false
/>

```sql timeline
select * from events where event_name not like '#%'
```

```sql monthly_stats_c
select 
s.year_month, s.value_c as new_rentals, 
s.cumulative_value_c as total
from al_pulse.stats s
join admin a on a.osm_id=s.area_id
where a.slug='${params.id}'
order by s.year_month
```

<LineChart
  title="New and Total AL Registrations"
  data={monthly_stats_c}
  y="total"
  y2="new_rentals"
  y2SeriesType=bar
  xField="year_month"
  yField="value"
  >
  <ReferenceLine data={timeline} x=event_date label=event_name hideValue/>
  </LineChart>

```sql lost_licenses_stats
select
  sum(case when year_month = date_trunc('month', current_date) then value_lost_licenses else 0 end) as last_month_lost,
  sum(case when year(year_month) = year(current_date) then value_lost_licenses else 0 end) as ytd_lost,
  sum(case when year(year_month) = year(current_date) - 1 then value_lost_licenses else 0 end) as last_year_total
from al_pulse.stats s
join admin a on a.osm_id=s.area_id
where a.slug='${params.id}'
```

## Lost Licenses

<Grid cols=2>
<BigValue
  title="Lost Licenses Last Month"
  data={lost_licenses_stats}
  value=last_month_lost
  fmt="num0"
  description="Number of AL licenses lost in the most recent month in this area"
  />
<BigValue
  title="Lost Licenses Year-to-Date"
  data={lost_licenses_stats}
  value=ytd_lost
  fmt="num0"
  description="Total number of AL licenses lost this year in this area"
  />
</Grid>

```sql lost_licenses_monthly
select
  s.year_month,
  s.value_lost_licenses as monthly_lost,
  s.cumulative_value_lost_licenses as total_lost
from al_pulse.stats s
join admin a on a.osm_id=s.area_id
where a.slug='${params.id}' and s.value_lost_licenses > 0
order by s.year_month
```

<LineChart
  title="Lost Licenses Over Time"
  data={lost_licenses_monthly}
  x="year_month"
  y="total_lost"
  y2="monthly_lost"
  y2SeriesType=bar
  xAxisTitle="Month"
  yAxisTitle="Number of Lost Licenses"
>
  <ReferenceLine data={timeline} x=event_date label=event_name hideValue/>
</LineChart>

```sql monthly_growth
with area_hierarchy as (
  select osm_id, full_name, 1 as ord from admin
  where slug='${params.id}'
  union all
  select ah.osm_id, ah.full_name, 2 as ord
  from admin a
  join admin ah on a.parent_id = ah.osm_id
  where a.slug='${params.id}'
  union all
  select ahp.osm_id, ahp.full_name, 3 as ord
  from admin a
  join admin ah on a.parent_id = ah.osm_id
  join admin ahp on ah.parent_id = ahp.osm_id
  where a.slug='${params.id}'
  union all 
  select 0 as osm_id, 'Portugal' as full_name, 4 as ord
  
)

select 
a.full_name as area_name,
s.year_month,
s.cumulative_value_c / nullif(s_base.cumulative_value_c, 0) as growth_since_base
from al_pulse.stats s
join area_hierarchy a on a.osm_id=s.area_id
-- join admin parent_a on a.parent_id=parent_a.osm_id
join al_pulse.stats s_base on s.area_id=s_base.area_id and s_base.year_month = date_trunc('month', current_date + interval '1 month' * ${inputs.base_date})

order by a.ord, s.year_month
```

```sql subareas_growth
select 
a.name as area_name,
s.year_month,
s.cumulative_value_c / nullif(s_base.cumulative_value_c, 0) as growth_since_base
from al_pulse.stats s
join admin a on a.osm_id=s.area_id
join admin a_parent on a.parent_id=a_parent.osm_id
join al_pulse.stats s_base on s.area_id=s_base.area_id and s_base.year_month = date_trunc('month', current_date + interval '1 month' * ${inputs.base_date})
where a_parent.slug='${params.id}'
order by a.name, s.year_month
```

### Growth compared to { new Date(new Date().setMonth(new Date().getMonth() -  -(inputs.base_date))).toLocaleString('en-US', { month: 'long', year: 'numeric' })}
  
<Slider
title="Month offset for growth calculation base"
    name='base_date'
    size=large
    maxColumn=max_fare
    min=-150
    max=-5
    showMaxMin=false
/> 

{#if admin_info[0].admin_type!='locality'}
<Tabs>
  <Tab label="Area Growth">
    <LineChart
      title="100% is { new Date(new Date().setMonth(new Date().getMonth() -  -(inputs.base_date))).toLocaleString('en-US', { month: 'long', year: 'numeric' })}"
      data={monthly_growth}
      series="area_name"
      y="growth_since_base"
      x="year_month"
      yField="value"
      yFmt="pct"
      >
      <ReferenceLine data={timeline} x=event_date label=event_name hideValue/>
      <ReferencePoint 
      x={ new Date(new Date().setMonth(new Date().getMonth() -  -(inputs.base_date)))} 
      y=1 label={ new Date(new Date().setMonth(new Date().getMonth() -  -(inputs.base_date))).toLocaleString('en-US', { month: 'long', year: 'numeric' })} labelPosition=bottom color=base-content-muted/>
        
      </LineChart>
  </Tab>
  
  <Tab label="Subareas Comparison">
    <LineChart
      title="Subareas Growth - 100% is { new Date(new Date().setMonth(new Date().getMonth() -  -(inputs.base_date))).toLocaleString('en-US', { month: 'long', year: 'numeric' })}"
      data={subareas_growth}
      series="area_name"
      y="growth_since_base"
      x="year_month"
      yField="value"
      yFmt="pct"
      >
      <ReferenceLine data={timeline} x=event_date label=event_name hideValue/>
      <ReferencePoint 
      x={ new Date(new Date().setMonth(new Date().getMonth() -  -(inputs.base_date)))} 
      y=1 label={ new Date(new Date().setMonth(new Date().getMonth() -  -(inputs.base_date))).toLocaleString('en-US', { month: 'long', year: 'numeric' })} labelPosition=bottom color=base-content-muted/>
        
      </LineChart>
  </Tab>
</Tabs>
{:else}
<LineChart
  title="100% is { new Date(new Date().setMonth(new Date().getMonth() -  -(inputs.base_date))).toLocaleString('en-US', { month: 'long', year: 'numeric' })}"
  data={monthly_growth}
  series="area_name"
  y="growth_since_base"
  x="year_month"
  yField="value"
  yFmt="pct"
  >
  <ReferenceLine data={timeline} x=event_date label=event_name hideValue/>
  <ReferencePoint 
  x={ new Date(new Date().setMonth(new Date().getMonth() -  -(inputs.base_date)))} 
  y=1 label={ new Date(new Date().setMonth(new Date().getMonth() -  -(inputs.base_date))).toLocaleString('en-US', { month: 'long', year: 'numeric' })} labelPosition=bottom color=base-content-muted/>
    
  </LineChart>
{/if}

 

{#if admin_info[0].admin_type!='locality'}

```sql monthly_subarea_stats_c
select 
a.name,
s.year_month,
s.cumulative_value_c as total
from al_pulse.stats s
join admin a on a.osm_id=s.area_id
join admin a_o on a.parent_id=a_o.osm_id
where a_o.slug='${params.id}'
order by a.name, s.year_month
```
<Checkbox
    title="Display as 100% stacked"
    name=monthly_subarea_stacked
/>
{#if inputs.monthly_subarea_stacked }
<AreaChart
  title="Distribution by subarea"
  data={monthly_subarea_stats_c}
  y="total"
  x="year_month"
  series="name"
  type=stacked100
  />
{:else }
<AreaChart
  title="Distribution by subarea"
  data={monthly_subarea_stats_c}
  y="total"
  x="year_month"
  series="name"
  />
  {/if}
{/if}

{#if admin_info[0].admin_type!='locality'}


```sql municipalities_data
select 
  area_url as region_url,
  area_name as region,
  al_count,
  inhabitants_per_al,
  al_per_1000,
  rank_within_country,
  al_count_growth_pcnt,
  rank_within_country_change
from al_pulse.area_summary 
where direct_parent_slug = '${params.id}' and admin_type = 'municipality'
```

```sql localities_data  
select 
  area_url as region_url,
  area_name as region,
  al_count,
  inhabitants_per_al,
  al_per_1000,
  rank_within_country,
  al_count_growth_pcnt,
  rank_within_country_change
from al_pulse.area_summary 
where (ancestor_region_slug = '${params.id}' or ancestor_municipality_slug = '${params.id}') 
  and admin_type = 'locality'
```

{#if admin_info[0].admin_type == 'region'}
<Tabs>
  <Tab label="Municipalities">
    <DataTable
      title="Municipalities"
      data={municipalities_data}  
      rows="all"
    >
     <Column
        id="region_url"
        linkLabel=region
        title="Municipality"
        contentType=link  
        />
     <Column
        id="al_count"
        title="AL Count"
        contentType=bar barColor=#aecfaf
        />
      <Column
        id="al_count_growth_pcnt"
        title="Growth last 3 years"
        contentType=delta
        fmt="pct"
        />
      <Column
        id="inhabitants_per_al"
        title="Inhabitants per AL"
        scaleColumn=al_per_1000
        contentType=colorscale colorScale=negative
        />
      <Column
        id="rank_within_country"
        title="Rank"
        contentType=bar
        />
      <Column
        id="rank_within_country_change"
        title="Rank Change"
        contentType=delta
        />
    </DataTable>
  </Tab>
  
  <Tab label="Localities">
    <DataTable
      title="Localities"
      data={localities_data}  
      rows="all"
    >
     <Column
        id="region_url"
        linkLabel=region
        title="Locality"
        contentType=link  
        />
     <Column
        id="al_count"
        title="AL Count"
        contentType=bar barColor=#aecfaf
        />
      <Column
        id="al_count_growth_pcnt"
        title="Growth last 3 years"
        contentType=delta
        fmt="pct"
        />
      <Column
        id="inhabitants_per_al"
        title="Inhabitants per AL"
        scaleColumn=al_per_1000
        contentType=colorscale colorScale=negative
        />
      <Column
        id="rank_within_country"
        title="Rank"
        contentType=bar
        />
      <Column
        id="rank_within_country_change"
        title="Rank Change"
        contentType=delta
        />
    </DataTable>
  </Tab>
</Tabs>

{:else}
<!-- For municipalities, only show localities (no tabs needed) -->
<DataTable
  title="Localities"
  data={localities_data}  
  rows="all"
 >
 <Column
    id="region_url"
    linkLabel=region
    title="Locality"
    contentType=link  
    />
 <Column
    id="al_count"
    title="AL Count"
    contentType=bar barColor=#aecfaf
    />
  <Column
    id="al_count_growth_pcnt"
    title="Growth last 3 years"
    contentType=delta
    fmt="pct"
    />
  <Column
    id="inhabitants_per_al"
    title="Inhabitants per AL"
    scaleColumn=al_per_1000
    contentType=colorscale colorScale=negative
    />
  <Column
    id="rank_within_country"
    title="Rank"
    contentType=bar
    />
        <Column
    id="rank_within_country_change"
    title="Rank Change"
    contentType=delta
    />
</DataTable>
{/if}

{/if}

{#if admin_info[0].admin_type!='locality'}

```sql area_room_distribution
select rdc.* from al_pulse.room_distribution_comparison rdc
join admin a on rdc.area_id = a.osm_id
where rdc.group_id = rdc.area_id 
  and (
    (a.region_slug = '${params.id}' and a.admin_type = 'municipality') or
    (a.municipality_slug = '${params.id}' and a.admin_type = 'locality')
  )
```

## Room Distribution Comparison

{#if admin_info[0].admin_type == 'region'}
<BarChart
  title="Room Distribution Comparison by Municipality"
  data={area_room_distribution}
  x=name
  y=value
  series=metric_name
  type=stacked100
  swapXY=true
  xAxisTitle="Municipality"
  yAxisTitle="Percentage"
  sort=false
/>
{/if}

{#if admin_info[0].admin_type == 'municipality'}
<BarChart
  title="Room Distribution Comparison by Locality"
  data={area_room_distribution}
  x=name
  y=value
  series=metric_name
  type=stacked100
  swapXY=true
  xAxisTitle="Locality"
  yAxisTitle="Percentage"
  sort=false
/>
{/if}

{/if}