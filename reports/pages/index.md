---
title: Portugal Alojamento Local Statistics
full_width: true
hide_breadcrumbs: true
---
<LastRefreshed/>


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

```sql monthly_stats_1951
select year_month, cumulative_value_is_building_post_1951 as share_of_buildings_post_1951 from al_pulse.stats where area_id=0
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

```sql monthly_stats_rooms
select year_month, 
cumulative_value_rooms_0 as studio,
cumulative_value_rooms_1 as one_room,
cumulative_value_rooms_2 as two_rooms,
cumulative_value_rooms_3 as three_rooms,
cumulative_value_rooms_more_than_3 as more_than_three_rooms
from al_pulse.stats where area_id=0
order by year_month
```

<AreaChart
  title="Distribution of rooms"
  data={monthly_stats_rooms}
  yField={["studio", "one_room", "two_rooms", "three_rooms", "more_than_three_rooms"]}
  xField="year_month"
  yFmt="pct"
  />

``` sql growth_density_correlation
select a.full_name as area_name,
1000 / s.cumulative_value_al_per_1000 as inhabitants_per_al,
s.cumulative_value_c / s_old.cumulative_value_c as growth
from stats s
join admin a on a.osm_id=s.area_id and a.admin_type='locality'
join stats s_old on s_old.area_id=s.area_id and s_old.year_month = date_trunc('month', current_date) - interval '3 years'
where s.year_month = date_trunc('month', current_date)
and 1000 / s.cumulative_value_al_per_1000 < 500
```

<ScatterPlot 
    data={growth_density_correlation}
    tooltipTitle="area_name"
    x=inhabitants_per_al
    y=growth
    yLog=true
    yLogBase=10
    yFmt=pct
/>

``` sql region_stats
select a.name as region, 
s.cumulative_value_c as al_count, 
1000/s.cumulative_value_al_per_1000 as inhabitants_per_al,
s.country_rank_c as rank_within_country
from stats s
join admin a on a.osm_id=s.area_id
where a.admin_type='region' and area_id != 0
and s.year_month = date_trunc('month', current_date)
order by a.name
```

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
    WHERE a.admin_type = 'region'
      AND s.area_id <> 0
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
-- , series AS (
--     SELECT
--         region,
--         ARRAY_AGG({'date': month_date, 'al_count': al_count} ORDER BY month_date)            AS al_count_series,
--         ARRAY_AGG({'date': month_date, 'inhabitants_per_al': inhabitants_per_al} ORDER BY month_date)
--                                                                                              AS inhabitants_per_al_series,
--         ARRAY_AGG({'date': month_date, 'rank_within_country': rank_within_country} ORDER BY month_date)
--                                                                                              AS rank_within_country_series              
--     FROM regional_monthly
--     GROUP BY region
-- )
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

