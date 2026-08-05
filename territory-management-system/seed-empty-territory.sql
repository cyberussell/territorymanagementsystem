-- One-off seed script, not a migration — creates a test territory with 0 approved records,
-- 4 sections, 6 blocks per section, for testing the empty-territory canvassing flow. Mirrors
-- create_territory_structure()'s internal logic directly (skipping its is_congregation_admin
-- check, which only ever passes for a real logged-in app session, not the SQL Editor).
do $$
declare
  v_congregation_id uuid;
  v_territory_id uuid;
  v_section_id uuid;
  s int;
  b int;
begin
  select id into v_congregation_id from public.congregations limit 1;

  insert into public.territories (congregation_id, name, description)
  values (
    v_congregation_id,
    'Test Territory (No Records Yet)',
    'Seeded for testing the empty-territory canvassing flow — 0 approved records, 4 sections, 6 blocks each.'
  )
  returning id into v_territory_id;

  for s in 1..4 loop
    insert into public.territory_sections (congregation_id, territory_id, label, sort_order)
    values (v_congregation_id, v_territory_id, public.tms_section_label(s), s)
    returning id into v_section_id;

    for b in 1..6 loop
      insert into public.territory_blocks (congregation_id, territory_id, section_id, label, sort_order)
      values (v_congregation_id, v_territory_id, v_section_id, b::text, b);
    end loop;
  end loop;
end $$;
