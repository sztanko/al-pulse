-- define thresholds:
{% set thresholds = [50, 66, 75, 90] %}
WITH

base_stats AS (
    SELECT
        r.area_id,
        year_month,
        cumulative_value_c AS num_al,
        a.slug,
        a.admin_type,
        a.municipality_slug,
        a.region_slug,
        a.population
    FROM {{ ref('region_stats') }} AS r
    LEFT JOIN {{ ref('admin') }} AS a ON r.area_id = a.osm_id
    WHERE year_month = date_trunc('month', current_date - interval '1 month')
),

top_admin AS (
    SELECT
        a.osm_id,
        a.name,
        a.slug,
        b.num_al,
        sum(al.population) AS population,
        count(*) AS num_localities
    FROM {{ ref('admin') }} AS a
    LEFT JOIN base_stats AS b ON a.osm_id = b.area_id
    LEFT JOIN {{ ref('admin') }} AS al ON a.slug = al.region_slug OR a.slug = al.municipality_slug
    WHERE
        a.admin_type IN ('region', 'municipality')
        AND al.admin_type = 'locality'
    GROUP BY a.osm_id, a.name, a.slug, a.population, num_al

    UNION ALL
    SELECT
        0 AS osm_id,
        'Portugal' AS name,
        'portugal' AS slug,
        sum(b.num_al) AS num_al,
        sum(a.population) AS population,
        count(*) AS num_localities
    FROM {{ ref('admin') }} AS a
    LEFT JOIN base_stats AS b ON a.osm_id = b.area_id
    WHERE a.admin_type = 'locality'
),

cumulative AS (
    SELECT
        ta.*,
        bs.slug AS locality_slug,
        bs.num_al AS locality_num_al,
        bs.population AS locality_population,
        dense_rank() OVER (
            PARTITION BY ta.slug
            ORDER BY bs.num_al DESC, bs.slug ASC
        ) AS locality_rank,
        dense_rank() OVER (
            PARTITION BY ta.slug
            ORDER BY bs.num_al DESC, bs.slug ASC
        ) / ta.num_localities AS locality_rank_pcnt,
        sum(bs.num_al) OVER (
            PARTITION BY ta.slug
            ORDER BY bs.num_al DESC
        ) AS total_al,
        (sum(bs.num_al) OVER (
            PARTITION BY ta.slug
            ORDER BY bs.num_al DESC
        )) / ta.num_al AS total_al_pcnt,
        sum(bs.population) OVER (
            PARTITION BY ta.slug
            ORDER BY bs.num_al DESC
        ) AS total_population,
        (sum(bs.population) OVER (
            PARTITION BY ta.slug
            ORDER BY bs.num_al DESC
        )) / ta.population AS total_population_pcnt
    FROM top_admin AS ta
    INNER JOIN base_stats AS bs ON ta.slug = bs.region_slug OR ta.slug = bs.municipality_slug OR ta.slug = 'portugal'
    WHERE bs.admin_type = 'locality'
    ORDER BY ta.slug ASC, bs.num_al DESC
),

p_90_threshold AS (
    SELECT
        name,
        slug,
        locality_rank,
        locality_rank_pcnt,
        total_al_pcnt,
        total_population_pcnt,
        lag(total_al_pcnt) OVER (
            PARTITION BY slug
            ORDER BY locality_rank_pcnt
        ) AS prev_total_al_pcnt
    FROM cumulative
),

result AS (
    SELECT
        CASE
            {% for threshold in thresholds %}
                WHEN
                    total_al_pcnt >= {{ threshold / 100 }}
                    AND prev_total_al_pcnt < {{ threshold / 100 }}
                    THEN '{{ threshold }}'
            {% endfor %}
            ELSE ''
        END AS threshold,
        *
    FROM p_90_threshold
    WHERE
        {% for threshold in thresholds %}
            total_al_pcnt >= {{ threshold / 100 }}
            AND prev_total_al_pcnt < {{ threshold / 100 }}
            OR
        {% endfor %}
        FALSE -- This is to ensure the WHERE clause is valid when no thresholds

)

-- select * from top_admin order by slug

SELECT * FROM result
ORDER BY slug, threshold
