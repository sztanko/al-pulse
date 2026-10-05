-- One point per registration, and how far to trust it. See
-- scripts/geocode_al.py for the rules behind `method` and `precision_m`.
SELECT
    -- Read back as a number when every id is numeric; the register's is text.
    al_id::VARCHAR AS al_id,
    CASE WHEN lat IS NOT null THEN st_point(lng, lat) END AS geom,
    method AS geocode_method,
    confidence AS geocode_confidence,
    precision_m AS geocode_precision_m
FROM {{ source('raw', 'al_geocoded') }}
