-- The Azorean register publishes the operator's name, e-mail, phone and mobile
-- in every row. scripts/azores_cleansing.py drops them before the CSV is
-- written, and the CSV is committed to a public repository.
--
-- That makes the drop a property worth asserting rather than trusting: a rule
-- silently stopping (a field renamed upstream, a column list edited) would
-- publish personal data for thousands of people, and nothing else in the
-- pipeline would notice. This test reads the loaded source table's own column
-- names, so it fails on the file that was actually committed rather than on
-- what the script intended to write.
--
-- `site` is included: it is a business URL rather than personal data, but it is
-- in the same group of contact columns and there is no reason for it here.

SELECT
    'personal_data_column_present' AS violation,
    column_name
FROM information_schema.columns
WHERE
    table_name = 'azores_al_raw_data'
    AND lower(column_name) IN (
        'proprietar',
        'proprietario',
        'email',
        'e_mail',
        'telefone',
        'telemovel',
        'telemóvel',
        'contacto',
        'nif',
        'contribuinte',
        'site'
    )
