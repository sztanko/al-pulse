SELECT
    id,
    name,
    full_name,
    slug,
    '../areas/' || slug as link,
    population,
    al_count,
    rank_within_country,
    people_per_al,
    people_per_al_rank
FROM localities_with_data_for_geojson