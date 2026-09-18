# Feature parity contract — Evidence → bespoke site

Every element the Evidence reports rendered, catalogued before the rewrite so
"nothing is missed out" is checkable rather than asserted. Each line is ticked
only when the replacement is built *and* verified in the built output.

**Status: all 60 items built.** `npm run verify` passes over 7 routes × 2
themes × 2 viewport classes, asserting no horizontal overflow, no control
covered by the sticky header, no console errors / page errors / failed
requests, and that the growth slider actually redraws the marks when driven
by keyboard.

Source of truth for this list: `reports/pages/{index,map,areas/[id]}.md` at
commit `d492024`.

## Page: `/` (index)

| # | Element | Type | Status |
|---|---|---|---|
| 1 | Last refreshed | derived timestamp | ✅ |
| 2 | Total Alojamento Local properties | metric | ✅ |
| 3 | % of localities hosting 50% of ALs | metric (`distribution_skew`, threshold 50) | ✅ |
| 4 | % of population in those localities | metric | ✅ |
| 5 | New and Total AL Registrations | dual-axis line + bar, monthly | ✅ |
| 6 | — event reference lines on that chart | annotation (`events`, excludes `#%`) | ✅ |
| 7 | Lost Licenses Last Month | metric | ✅ |
| 8 | Lost Licenses Year-to-Date | metric | ✅ |
| 9 | Lost Licenses Over Time | dual-axis line + bar | ✅ |
| 10 | — event reference lines | annotation | ✅ |
| 11 | Regions table | sortable table, 6 measures | ✅ |
| 12 | — AL Count as in-cell bar | bar column | ✅ |
| 13 | — Growth last 3 years as signed delta | delta column | ✅ |
| 14 | — Inhabitants per AL, colour-scaled by `al_per_1000` | colour scale | ✅ |
| 15 | — Rank as in-cell bar | bar column | ✅ |
| 16 | — Rank change as signed delta | delta column | ✅ |
| 17 | — region name links to its area page | link | ✅ |
| 18 | Room Distribution by Region | 100% stacked bar, horizontal | ✅ |

## Page: `/map`

| # | Element | Type | Status |
|---|---|---|---|
| 19 | Choropleth of all 2,471 localities | map | ✅ |
| 20 | — coloured by `rank_within_country` | sequential ramp (9 steps) | ✅ |
| 21 | — pan and zoom | interaction | ✅ |
| 22 | — tooltip: full_name, al_count, rank, people_per_al | readout at pointer | ✅ |
| 23 | — tooltip link through to the area page | link | ✅ |

## Page: `/areas/<slug>` (2,779 pages)

Conditional on `admin_type` ∈ {region, municipality, locality}.

| # | Element | Type | Cond. | Status |
|---|---|---|---|---|
| 24 | Breadcrumb `Portugal > … > name` | nav | all | ✅ |
| 25 | Title = `full_name` | heading | all | ✅ |
| 26 | Back-link to parent (or to index for a region) | nav | all | ✅ |
| 27 | Population | value | all | ✅ |
| 28 | Active Listings + 3-year growth | metric w/ delta | all | ✅ |
| 29 | Inhabitants per AL + 3-year change | metric w/ delta | all | ✅ |
| 30 | Rank within Country + 3-year change | metric w/ delta | all | ✅ |
| 31 | Rank within Region + change | metric w/ delta | ≠region | ✅ |
| 32 | Rank within Municipality + change | metric w/ delta | locality | ✅ |
| 33 | % of localities hosting 50% of ALs | metric | ≠locality | ✅ |
| 34 | % of population in those localities | metric | ≠locality | ✅ |
| 35 | Room Distribution Analysis | 100% stacked bar, horizontal | all | ✅ |
| 36 | New and Total AL Registrations | dual-axis line + bar | all | ✅ |
| 37 | — event reference lines | annotation | all | ✅ |
| 38 | Lost Licenses Last Month | metric | all | ✅ |
| 39 | Lost Licenses Year-to-Date | metric | all | ✅ |
| 40 | Lost Licenses Over Time | dual-axis line + bar | all | ✅ |
| 41 | **Growth rebase slider**, −150…−5 months | interactive | all | ✅ |
| 42 | — heading names the base month, live | derived copy | all | ✅ |
| 43 | — Area Growth: this area + parent + grandparent + Portugal | multi-series line | ≠locality (tab) | ✅ |
| 44 | — Subareas Comparison: all children | multi-series line | ≠locality (tab) | ✅ |
| 45 | — single growth chart | multi-series line | locality | ✅ |
| 46 | — reference point at base month, y=1 | annotation | all | ✅ |
| 47 | — event reference lines on growth charts | annotation | all | ✅ |
| 48 | Distribution by subarea | stacked area | ≠locality | ✅ |
| 49 | — "Display as 100% stacked" toggle | interactive | ≠locality | ✅ |
| 50 | Municipalities table | sortable table | region (tab) | ✅ |
| 51 | Localities table | sortable table | region (tab) / municipality | ✅ |
| 52 | — same 6 measures + bars + deltas as the Regions table | | | ✅ |
| 53 | Room Distribution Comparison | 100% stacked bar | ≠locality | ✅ |

## Cross-cutting

| # | Element | Status |
|---|---|---|
| 54 | Deployed at `/al-pulse` base path on GitHub Pages | ✅ |
| 55 | Every existing URL still resolves (`/areas/<slug>`) | ✅ |
| 56 | Light / dark / follow-system theme | ✅ |
| 57 | Every mark answers at the pointer, hover **and** tap | ✅ |
| 58 | No horizontal overflow at the narrowest supported width | ✅ |
| 59 | No console errors, page errors or failed requests | ✅ |
| 60 | Keyboard reaches everything hover reveals | ✅ |

## Deliberate departures

Recorded so they are choices, not omissions.

- **No basemap tiles on the map.** Evidence's `AreaMap` pulled CARTO tiles and
  rendered an "API KEY REQUIRED" watermark across the whole of Portugal on the
  live site. The replacement draws the polygons itself and keeps pan/zoom, so
  the functionality survives and the watermark does not.
- **The slider no longer re-queries.** Evidence interpolated `base_date` into
  SQL and re-ran DuckDB-WASM per drag. Rebasing is `cumulative[t] /
  cumulative[base]`, so the client can do it on the shipped series: the same
  result, instant, and it is what "seamless" requires.
- **Per-area payload shards.** Evidence shipped `stats` and `admin_stats`
  whole — Evidence itself warned they were 519.9 MB uncompressed each. Each
  area page now loads only its own series.

- **"Inhabitants per AL" is a bar, not a colour scale** (item 14). Evidence used
  `contentType=colorscale` keyed off `al_per_1000`. A length on a shared scale
  is read more accurately than a shade, the column is sortable either way, and
  it avoids encoding a quantity by colour alone. The measure and its ordering
  are unchanged.

- **Losses are no longer drawn as zero where nobody looked** (items 9, 40). The
  register has been pulled 12 times, and a lost licence is only detectable
  *between* two consecutive pulls. Evidence plotted `value_lost_licenses` over
  the whole axis, so the chart asserted a flat zero from 2012 to mid-2025 —
  thirteen years in which nothing could have been observed — and then a cliff
  in whichever month the next pull happened. The charts now start at the first
  month a loss is detectable and leave unobserved months blank. `/method`
  states the cadence and the gap. Same data; it no longer claims more than it
  can support.

- **The headline total is the current total, not the all-time peak.** This one
  is a fix, not a preference. `index.md` computed it as

  ```sql
  select max(cumulative_value_c) as num_al from al_pulse.stats where area_id=0
  ```

  with no month filter, so it reported the maximum the register ever reached.
  That was indistinguishable from "current" for as long as the register only
  grew. It stopped being so in 2026-01, which is the peak:

  | | value | month |
  |---|---|---|
  | `max(...)` — what the live site shows | 122,838 | 2026-01 |
  | latest month | 114,987 | 2026-09 |

  The live site is overstating the count by 7,851 (6.8%) and would go on
  showing 122,838 however far the register fell. The new headline reads the
  latest month and names the peak separately, so the decline is the story
  rather than a number that silently stopped moving. The area pages were never
  affected — `admin_stats` filtered to the current month.
