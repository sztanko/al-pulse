COPY (
  SELECT * FROM {{ ref('admin') }}
)
TO 'output.parquet'
WITH (FORMAT PARQUET)