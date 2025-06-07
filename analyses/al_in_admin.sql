select * from {{ref('al') }}
left join {{ref("admin") }} as a
on st_contains(a.geom, al.geom)
where postal_code like '9370-75%'
and al_id='146055'