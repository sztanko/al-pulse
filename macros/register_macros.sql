{% macro register_macros() %}
-- first-letter capitalisation
CREATE OR REPLACE MACRO CAP(s) AS
    UPPER(substring(s, 1, 1)) || LOWER(substring(s, 2));

-- full capitalisation + collapse multiple spaces to one
CREATE OR REPLACE MACRO capitalize(s) AS
CASE
    WHEN s IS NULL OR s = ''                       THEN s
    WHEN s ~ '^\P{L}*$'                           THEN s                  -- only non-letters
    WHEN s ~ '^\p{L}+$'                           THEN CAP(s)             -- pure letters
    WHEN s ~ '^\P{L}+\p{L}+$'                     THEN CAP(s)             -- prefix symbols + letters
    ELSE (
        WITH
        cte AS (
            SELECT
                regexp_split_to_array(s, '\P{L}+') AS words,   -- letter runs
                regexp_split_to_array(s, '\p{L}+') AS gaps     -- non-letter runs
        ),
        zipped AS (
            SELECT list_zip(gaps, words) AS pairs FROM cte
        ),
        assembled AS (
            SELECT
            CASE WHEN length(pairs) = 0 THEN ''
                 ELSE
                    list_reduce(
                        [COALESCE(p[1], '') || CAP(COALESCE(p[2], '')) FOR p IN pairs],
                        (a, b) -> a || b
                    )
            END AS raw_res
            FROM zipped
        )
        -- squash 2+ spaces into one
        SELECT regexp_replace(raw_res, ' {2,}', ' ', 'g') AS res
        FROM assembled
    )
END;
{% endmacro %}
