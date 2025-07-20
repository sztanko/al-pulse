---
title: Portugal Alojamento Local Statistics
full_width: true
hide_breadcrumbs: true
---
<LastRefreshed/>

```sql totals
select max(cumulative_value_c) as num_al from al_pulse.stats where area_id=0
```

```sql skew
select * from al_pulse.distribution_skew where slug='portugal' and threshold='50'
```

<Grid cols=3>
<BigValue
  title="Total Alojamento Local properties"
  data={totals}
  value=num_al
  description="Total number of Alojamento Local properties in Portugal"
  />
<BigValue
  title="of all localities host 50% of ALs"
  data={skew}
  value=locality_rank_pcnt
  fmt="pct1"
  description="Percentage of localities that host 50% of all Alojamento Local properties"
  />
  <BigValue
  title="% live in places with half of all ALs."
  data={skew}
  value=total_population_pcnt
  fmt="pct1"
  description="Percentage of population that lives in localities hosting 50% of all Alojamento Local properties"
  />
</Grid>

```sql timeline
select * from events where event_name not like '#%'
```

```sql monthly_stats_c
select year_month, value_c as new_rentals, cumulative_value_c as total from al_pulse.stats where area_id=0
order by year_month
```

<LineChart
  title="Monthly Stats"
  data={monthly_stats_c}
  y="total"
  y2="new_rentals"
  y2SeriesType=bar
  xField="year_month"
  yField="value"
  >
  <ReferenceLine data={timeline} x=event_date label=event_name hideValue/>
  </LineChart>

```sql region_stats_series
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
where admin_type = 'region'
```
<DataTable
  title="Regions"
  data={region_stats_series}  
  rows="all"
 >
 <Column
    id="region_url"
    linkLabel=region
    title="Region"
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

```sql region_room_distribution
select * from al_pulse.room_distribution_comparison 
where group_id = area_id and admin_type = 'region'
```

## Room Distribution by Region

<BarChart
  title="Room Distribution Comparison by Region"
  data={region_room_distribution}
  x=name
  y=value
  series=metric_name
  type=stacked100
  swapXY=true
  xAxisTitle="Region"
  yAxisTitle="Percentage"
  sort=false
/>
