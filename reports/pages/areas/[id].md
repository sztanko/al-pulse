---
title: Portugal Alojamento Local Statistics
full_width: true
hide_breadcrumbs: true
---
<LastRefreshed/>


<Details title='How to edit this page'>

  This page can be found in your project at `/pages/index.md`. Make a change to the markdown file and save it to see the change take effect in your browser.
</Details>

```sql monthly_stats
select year_month, value, cumulative_value, metric_name from al_pulse.stats where area_id=0 and metric_name='c'
order by year_month
```

<LineChart
  title="Monthly Stats"
  data={monthly_stats}
  y="cumulative_value"
  y2="value"
  y2SeriesType=bar
  xField="year_month"
  yField="value"
  />

``` sql region_stats
select a.name as region, s.cumulative_value, 
from stats s
join admin a on a.osm_id=s.area_id
where s.metric_name='c' and a.admin_type='region' and area_id != 0
and s.year_month = date_trunc('month', current_date)
```
