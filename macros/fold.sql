{% macro fold(col) %}
    {#-
      Comparison form for a place name: accent-free, case-free, punctuation
      collapsed to single spaces, trimmed.

      This mirrors `fold()` in scripts/azores_cleansing.py exactly, and the two
      have to stay in step — the Python side decides which values are *distinct*
      when deduplicating, and this side decides which ones *join*. The existing
      joins in al.sql and invalid_postcode_similarities.sql use bare
      `lower(strip_accents(...))`, which is the same thing without the
      punctuation step; the Azorean register needs the extra step because it
      carries values like `São Mateus (Calheta)` against OSM's
      `São Mateus da Calheta`.
    -#}
    trim(regexp_replace(lower(strip_accents({{ col }})), '[^a-z0-9]+', ' ', 'g'))
{% endmacro %}
