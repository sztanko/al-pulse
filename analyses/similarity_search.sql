-- Name	Description
-- damerau_levenshtein(s1, s2)	Extension of Levenshtein distance to also include transposition of adjacent characters as an allowed edit operation. In other words, the minimum number of edit operations (insertions, deletions, substitutions or transpositions) required to change one string to another. Characters of different cases (e.g., a and A) are considered different.
-- editdist3(s1, s2)	The minimum number of single-character edits (insertions, deletions or substitutions) required to change one string to the other. Characters of different cases (e.g., a and A) are considered different.
-- hamming(s1, s2)	The Hamming distance between to strings, i.e., the number of positions with different characters for two strings of equal length. Strings must be of equal length. Characters of different cases (e.g., a and A) are considered different.
-- jaccard(s1, s2)	The Jaccard similarity between two strings. Characters of different cases (e.g., a and A) are considered different. Returns a number between 0 and 1.
-- jaro_similarity(s1, s2[, score_cutoff])	The Jaro similarity between two strings. Characters of different cases (e.g., a and A) are considered different. Returns a number between 0 and 1. For similarity < score_cutoff, 0 is returned instead. score_cutoff defaults to 0.
-- jaro_winkler_similarity(s1, s2[, score_cutoff])	The Jaro-Winkler similarity between two strings. Characters of different cases (e.g., a and A) are considered different. Returns a number between 0 and 1. For similarity < score_cutoff, 0 is returned instead. score_cutoff defaults to 0.
-- levenshtein(s1, s2)	The minimum number of single-character edits (insertions, deletions or substitutions) required to change one string to the other. Characters of different cases (e.g., a and A) are considered different.
-- mismatches(s1, s2)	The Hamming distance between to strings, i.e., the number of positions with different characters for two strings of equal length. Strings must be of equal length. Characters of different cases (e.g., a and A) are considered different.
{%set s1 = 'São Martinho Funchal' %}
{%set s2 = 'São Martinho' %}

with rows as (
    select
        '{{ s1 }}' as s1,
        '{{ s2 }}' as s2 
)

select s1, s2,
round(damerau_levenshtein(s1, s2), 3) as damerau, 
round(editdist3(s1, s2), 3) as editdist3,
round(jaccard(s1, s2), 3) as jaccard,
round(jaro_similarity(s1, s2), 3) as jaro,
round(jaro_winkler_similarity(s1, s2), 3) as jaro_winkler,
round(levenshtein(s1, s2), 3) as levenshtein,
from rows
where true
