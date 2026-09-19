{{ config(materialized='table') }}

-- Azorean registrations, resolved onto the OSM administrative hierarchy.
--
-- This is the relational half of the cleansing; the record-level half runs in
-- scripts/azores_cleansing.py before the CSV is ever written. The split is on
-- purpose: that side needs no geometry and no hierarchy, this side needs both.
--
-- Resolution is a ladder, best evidence first, and every row records which rung
-- it landed on so azores_data_quality.sql can report it:
--
--   point        the coordinates fall inside a freguesia polygon. Authoritative
--                — it does not care how the name was spelled, and the register
--                spells them many ways.
--   name         concelho and freguesia both match an OSM name exactly, once
--                folded. Used where coordinates are missing or unusable.
--   name_fuzzy   freguesia matches one name within the right concelho closely
--                enough to be the same place. `São Mateus` against OSM's
--                `São Mateus da Calheta` is the shape of it.
--   municipality only the concelho resolved. The row still counts towards its
--                municipality and the region; it has no freguesia.
--   unresolved   nothing matched. Counted nowhere, reported loudly.
--
-- Matching on names alone resolves about 54% of the register, because the
-- source and OSM disagree constantly about parenthetical qualifiers and saints'
-- names. The point-in-polygon rung takes that to nearly everything, which is
-- the whole reason the fetch keeps coordinates.

WITH listing AS (
    SELECT
        *,
        CASE
            WHEN latitude IS NOT NULL AND longitude IS NOT NULL
                THEN st_point(longitude, latitude)
        END AS geom
    FROM {{ ref('stg_azores_al') }}
),

-- The Azorean slice of the hierarchy. Restricting here rather than in each
-- join keeps the spatial predicate on ~155 polygons instead of 3,101.
az_municipalities AS (
    SELECT
        osm_id,
        name,
        slug
    FROM {{ ref('admin') }}
    WHERE
        admin_type = 'municipality'
        AND parent_id = {{ var('azores_region_osm_id') }}
),

az_localities AS (
    SELECT
        l.osm_id,
        l.name,
        l.slug,
        l.parent_id,
        l.geom
    FROM {{ ref('admin') }} AS l
    INNER JOIN az_municipalities AS m ON l.parent_id = m.osm_id
    WHERE l.admin_type = 'locality'
),

-- Which island each concelho sits on, as the register itself overwhelmingly
-- has it. Nineteen geographic facts, and a majority vote is self-maintaining
-- where a hardcoded list would quietly rot. The vote is taken over the typed
-- concelho, which is right for 99.6% of rows, and is only ever used to catch
-- a *coordinate* that disagrees.
municipality_island AS (
    SELECT
        municipality_osm_id,
        island
    FROM (
        SELECT
            m.osm_id AS municipality_osm_id,
            li.island,
            row_number() OVER (
                PARTITION BY m.osm_id ORDER BY count(*) DESC, li.island
            ) AS rn
        FROM listing AS li
        INNER JOIN az_municipalities AS m
            ON {{ fold('li.municipality_raw') }} = {{ fold('m.name') }}
        WHERE li.island IS NOT NULL
        GROUP BY m.osm_id, li.island
    )
    WHERE rn = 1
),

-- Rung 1: the point itself, cross-examined by the island.
--
-- The point beats the name almost every time — the two disagree about the
-- freguesia for 47% of rows, and the point is right, because the register's
-- freguesia spellings and OSM's diverge constantly. It beats the *concelho*
-- far less often (16 rows in 4,463), and among those a handful are the point
-- correcting a freguesia filed in the concelho column, which is exactly what
-- it is for.
--
-- The exception is a point that lands on a different island from the one the
-- register states. That is not the coordinates correcting the name, it is a
-- bad coordinate: nobody mistypes a freguesia into another archipelago. Two
-- rows in ~4,500, and `ilha` is an independent field, so it is worth asking.
by_point AS (
    SELECT
        source_id,
        locality_osm_id
    FROM (
        SELECT
            li.source_id,
            loc.osm_id AS locality_osm_id,
            -- Freguesia polygons should not overlap, but OSM is a shared map
            -- and occasionally they do; take one deterministically rather than
            -- multiplying the row.
            row_number() OVER (PARTITION BY li.source_id ORDER BY loc.osm_id) AS rn
        FROM listing AS li
        INNER JOIN az_localities AS loc ON st_contains(loc.geom, li.geom)
        LEFT JOIN municipality_island AS mi ON loc.parent_id = mi.municipality_osm_id
        WHERE
            li.geom IS NOT NULL
            AND (
                li.island IS NULL
                OR mi.island IS NULL
                OR li.island = mi.island
            )
    )
    WHERE rn = 1
),

-- Rung 2: both names, exactly, once folded.
by_name AS (
    SELECT
        li.source_id,
        loc.osm_id AS locality_osm_id
    FROM listing AS li
    INNER JOIN az_municipalities AS m
        ON {{ fold('li.municipality_raw') }} = {{ fold('m.name') }}
    INNER JOIN az_localities AS loc
        ON
            loc.parent_id = m.osm_id
            AND {{ fold('li.locality_raw') }} = {{ fold('loc.name') }}
),

-- Rung 3: the closest freguesia name inside the right concelho.
--
-- 0.92 is deliberately tight. It admits `São Mateus` -> `São Mateus da
-- Calheta`, and refuses `Santa Cruz` -> `Santa Bárbara`, which differ by one
-- word and mean two different villages. A looser threshold silently moves
-- registrations between freguesias, which is worse than leaving them at
-- municipality level where they are at least counted correctly.
by_fuzzy AS (
    SELECT
        source_id,
        locality_osm_id,
        score
    FROM (
        SELECT
            li.source_id,
            loc.osm_id AS locality_osm_id,
            jaro_winkler_similarity(
                {{ fold('li.locality_raw') }}, {{ fold('loc.name') }}
            ) AS score,
            row_number() OVER (
                PARTITION BY li.source_id
                ORDER BY jaro_winkler_similarity(
                    {{ fold('li.locality_raw') }}, {{ fold('loc.name') }}
                ) DESC, loc.osm_id
            ) AS rn
        FROM listing AS li
        INNER JOIN az_municipalities AS m
            ON {{ fold('li.municipality_raw') }} = {{ fold('m.name') }}
        INNER JOIN az_localities AS loc ON loc.parent_id = m.osm_id
        WHERE li.locality_raw IS NOT NULL
    )
    WHERE rn = 1 AND score >= 0.92
),

-- Rung 4: the concelho alone. Exact first, then close enough — the register
-- also files the occasional freguesia in the concelho column (`Furnas`,
-- `Lomba da Fazenda`), which this will not rescue and should not: those rows
-- fall through to their point, and failing that to unresolved.
by_municipality AS (
    SELECT
        source_id,
        municipality_osm_id
    FROM (
        SELECT
            li.source_id,
            m.osm_id AS municipality_osm_id,
            row_number() OVER (
                PARTITION BY li.source_id
                ORDER BY jaro_winkler_similarity(
                    {{ fold('li.municipality_raw') }}, {{ fold('m.name') }}
                ) DESC, m.osm_id
            ) AS rn,
            jaro_winkler_similarity(
                {{ fold('li.municipality_raw') }}, {{ fold('m.name') }}
            ) AS score
        FROM listing AS li
        CROSS JOIN az_municipalities AS m
        WHERE li.municipality_raw IS NOT NULL
    )
    WHERE rn = 1 AND score >= 0.94
),

resolved AS (
    SELECT
        li.*,
        coalesce(p.locality_osm_id, n.locality_osm_id, f.locality_osm_id) AS locality_osm_id,
        CASE
            WHEN p.locality_osm_id IS NOT NULL THEN 'point'
            WHEN n.locality_osm_id IS NOT NULL THEN 'name'
            WHEN f.locality_osm_id IS NOT NULL THEN 'name_fuzzy'
            WHEN mu.municipality_osm_id IS NOT NULL THEN 'municipality'
            ELSE 'unresolved'
        END AS area_match,
        f.score AS area_match_score,
        mu.municipality_osm_id AS fallback_municipality_osm_id
    FROM listing AS li
    LEFT JOIN by_point AS p ON li.source_id = p.source_id
    LEFT JOIN by_name AS n ON li.source_id = n.source_id
    LEFT JOIN by_fuzzy AS f ON li.source_id = f.source_id
    LEFT JOIN by_municipality AS mu ON li.source_id = mu.source_id
)

SELECT
    r.source_id,
    r.rral,
    r.name,
    r.house_type,
    r.island,
    r.municipality_raw,
    r.locality_raw,
    r.address,
    r.latitude,
    r.longitude,
    r.rooms,
    r.beds,
    r.units,
    r.etl_timestamp,
    r.area_match,
    r.area_match_score,
    l.osm_id AS locality_osm_id,
    l.name AS locality_name,
    -- A row that only resolved to a concelho still belongs to that concelho.
    coalesce(m.osm_id, fm.osm_id) AS municipality_osm_id,
    coalesce(m.name, fm.name) AS municipality_name,
    {{ var('azores_region_osm_id') }} AS region_osm_id,
    'Açores' AS region_name
FROM resolved AS r
LEFT JOIN {{ ref('admin') }} AS l
    ON r.locality_osm_id = l.osm_id AND l.admin_type = 'locality'
LEFT JOIN {{ ref('admin') }} AS m
    ON l.parent_id = m.osm_id AND m.admin_type = 'municipality'
LEFT JOIN {{ ref('admin') }} AS fm
    ON r.fallback_municipality_osm_id = fm.osm_id AND fm.admin_type = 'municipality'
