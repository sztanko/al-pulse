select osm_id, name, full_name, parent_name, parent_path, population, admin_type, 
parent_id, slug,
municipality_slug, region_slug,
'areas/' || municipality_slug as municipality_link,
'areas/' || region_slug as region_link
 from admin