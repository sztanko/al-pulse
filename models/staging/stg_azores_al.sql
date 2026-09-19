-- The Azorean regional register (RRAL), latest pull only.
--
-- Written by scripts/fetch_azores.py, which has already done the record-level
-- cleansing: personal data removed, text normalised, types coerced and bounded,
-- coordinates validated, duplicates collapsed. What is left here is typing and
-- picking the newest snapshot.
--
-- There is no registration date in this source and there never has been, which
-- is why nothing downstream of this model feeds region_stats. Every monthly
-- pull is kept, so the *snapshots* form a series even though the records do
-- not; `etl_timestamp` is parsed from the filename for that reason.
WITH source AS (
    SELECT * FROM {{ source('raw', 'azores_al_raw_data') }}
),

latest AS (
    SELECT max(etl_timestamp) AS etl_timestamp FROM source
)

SELECT
    s.source_id,
    s.rral::INTEGER AS rral,
    s.nome AS name,
    s.tipo AS house_type,
    s.ilha AS island,
    -- `_raw` because these are the register's own spellings, not resolved
    -- areas. azores_al.sql is what turns them into osm_ids.
    s.concelho AS municipality_raw,
    s.freguesia AS locality_raw,
    s.morada AS address,
    s.latitude::DOUBLE AS latitude,
    s.longitude::DOUBLE AS longitude,
    s.quartos::INTEGER AS rooms,
    s.camas::INTEGER AS beds,
    s.ua::INTEGER AS units,
    s.etl_timestamp
FROM source AS s
INNER JOIN latest AS l ON s.etl_timestamp = l.etl_timestamp
