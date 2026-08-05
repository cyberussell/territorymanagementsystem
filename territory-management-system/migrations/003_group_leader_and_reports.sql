-- Territory Management System — Territory Group Leader role.
-- Run against the same dedicated TMS Supabase project as 001_init.sql / 002_assignment_engine.sql.
--
-- Adds a second real-account role (Group Leader) alongside Admin, provisioned the same manual
-- way (see SETUP.md). Group Leaders get read-only visibility into their congregation's
-- territory/assignment data for the new monitoring dashboard — no write policies, since
-- nothing in the spec asks them to edit anything. Reports (the other consumer of this
-- read path) run entirely off the admin's own already-full-access policies, so no schema
-- change was needed for Reports specifically.

alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('admin', 'group_leader'));

create or replace function public.is_congregation_group_leader(c uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and congregation_id = c and role = 'group_leader'
  );
$$;

create policy "group leader reads own congregation" on public.congregations
  for select using (public.is_congregation_group_leader(id));
create policy "group leader reads territories" on public.territories
  for select using (public.is_congregation_group_leader(congregation_id));
create policy "group leader reads sections" on public.territory_sections
  for select using (public.is_congregation_group_leader(congregation_id));
create policy "group leader reads blocks" on public.territory_blocks
  for select using (public.is_congregation_group_leader(congregation_id));
create policy "group leader reads records" on public.territory_records
  for select using (public.is_congregation_group_leader(congregation_id));
create policy "group leader reads visits" on public.territory_record_visits
  for select using (public.is_congregation_group_leader(congregation_id));
create policy "group leader reads assignment batches" on public.assignment_batches
  for select using (public.is_congregation_group_leader(congregation_id));
create policy "group leader reads assignment batch territories" on public.assignment_batch_territories
  for select using (public.is_congregation_group_leader(congregation_id));
create policy "group leader reads partnerships" on public.partnerships
  for select using (public.is_congregation_group_leader(congregation_id));
create policy "group leader reads partnership records" on public.partnership_records
  for select using (public.is_congregation_group_leader(congregation_id));
