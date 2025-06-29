---
breadcrumb: "select full_name as breadcrumb from admin where slug='${params.id}'"
full_width: true
hide_breadcrumbs: false
sidebar: hide
hide_sidebar: true
hide_toc: true
---

```sql admin_info
select * from admin where slug='${params.id}' limit 1
```

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


# {admin_info[0].full_name}
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
join al_pulse.stats s_base on s.area_id=s_base.area_id and s_base.year_month = '2018-01-01'

order by a.ord, s.year_month
```

<LineChart
  title="Growth compared to 2018 (100% is January 2018)"
  data={monthly_growth}
  series="area_name"
  y="growth_since_base"
  x="year_month"
  yField="value"
  yFmt="pct"
  >
  <ReferenceLine data={timeline} x=event_date label=event_name hideValue/>
  </LineChart>

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


```sql monthly_stats_1951
select year_month, cumulative_value_is_building_post_1951 as share_of_buildings_post_1951 
from al_pulse.stats 
join admin a on a.osm_id=stats.area_id
where a.slug='${params.id}'
order by year_month
```

<LineChart
  title="Share of buildings built after 1951, %"
  data={monthly_stats_1951}
  y="share_of_buildings_post_1951"
  yAxisTitle="Share of buildings built after 1951, %"
  xField="year_month"
  yField="value"
  yFmt="pct"
  >
  <ReferenceLine data={timeline} x=event_date label=event_name hideValue/>
</LineChart>

{#if admin_info[0].admin_type!='locality'}


``` sql region_stats_series
WITH regional_monthly AS (
    SELECT
        '/areas/' || a.slug                         AS region_url,
        a.name                                              AS region,
        s.year_month                                        AS month_date,
        s.cumulative_value_c                                AS al_count,
        s.cumulative_value_al_per_1000                      AS al_per_1000,
        1000.0 / s.cumulative_value_al_per_1000             AS inhabitants_per_al,
        s.country_rank_c                                    AS rank_within_country
    FROM stats s
    JOIN admin a ON a.osm_id = s.area_id
    JOIN admin a2 on a.parent_id = a2.osm_id
    WHERE a2.slug='${params.id}'
), latest AS (
    SELECT *
    FROM regional_monthly
    WHERE month_date = DATE_TRUNC('month', CURRENT_DATE)
), prev_year AS (
    SELECT
        region,
        al_count                 AS al_count_prev_year,
        rank_within_country      AS rank_prev_year
    FROM regional_monthly
    WHERE month_date = DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '3 year'
)
--, series AS (
--    SELECT
--        region,
--        ARRAY_AGG({'date': month_date, 'al_count': al_count} ORDER BY month_date)            AS al_count_series,
--        ARRAY_AGG({'date': month_date, 'inhabitants_per_al': inhabitants_per_al} ORDER BY month_date)
--                                                                                             AS inhabitants_per_al_series,
--        ARRAY_AGG({'date': month_date, 'rank_within_country': rank_within_country} ORDER BY month_date)
--                                                                                             AS rank_within_country_series              
--    FROM regional_monthly
--    GROUP BY region
--)
SELECT
    l.region_url,
    l.region,
    l.al_count,
    l.inhabitants_per_al,
    l.al_per_1000,
    l.rank_within_country,
    -- s.al_count_series,                -- sparkline data (count)
    -- s.inhabitants_per_al_series,      -- sparkline data (inhabitants per AL)
    -- s.rank_within_country_series,     -- sparkline data (rank within country)
    (l.al_count - p.al_count_prev_year) / NULLIF(p.al_count_prev_year, 0)
                                       AS al_count_growth_pcnt,
    (p.rank_prev_year - l.rank_within_country)                                             
                                       AS rank_within_country_change
FROM latest l
-- LEFT JOIN series    s USING (region)
LEFT JOIN prev_year p USING (region)
ORDER BY l.region;
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

{/if}