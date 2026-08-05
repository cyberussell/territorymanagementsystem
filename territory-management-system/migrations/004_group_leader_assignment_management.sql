-- Territory Management System — Move assignment-batch generation from Admin to Group Leader.
-- Run against the same dedicated TMS Supabase project as 001-003.
--
-- Confirmed with Russell: assignment generation (territory selection, partnership count,
-- QR/token creation, regeneration, deletion) becomes a Group Leader responsibility going
-- forward — the "campaign day, many publishers, decide fast" scenario is their call, not the
-- Admin's. Admin keeps full read access to assignments for oversight (and still owns
-- territories/records/congregation settings, untouched here), but loses write access on the
-- four assignment tables. This replaces migration 003's read-only Group Leader policies on
-- those same four tables with full ("for all") ones.

drop policy "admin manages assignment batches" on public.assignment_batches;
drop policy "group leader reads assignment batches" on public.assignment_batches;
create policy "admin reads assignment batches" on public.assignment_batches
  for select using (public.is_congregation_admin(congregation_id));
create policy "group leader manages assignment batches" on public.assignment_batches
  for all using (public.is_congregation_group_leader(congregation_id)) with check (public.is_congregation_group_leader(congregation_id));

drop policy "admin manages assignment batch territories" on public.assignment_batch_territories;
drop policy "group leader reads assignment batch territories" on public.assignment_batch_territories;
create policy "admin reads assignment batch territories" on public.assignment_batch_territories
  for select using (public.is_congregation_admin(congregation_id));
create policy "group leader manages assignment batch territories" on public.assignment_batch_territories
  for all using (public.is_congregation_group_leader(congregation_id)) with check (public.is_congregation_group_leader(congregation_id));

drop policy "admin manages partnerships" on public.partnerships;
drop policy "group leader reads partnerships" on public.partnerships;
create policy "admin reads partnerships" on public.partnerships
  for select using (public.is_congregation_admin(congregation_id));
create policy "group leader manages partnerships" on public.partnerships
  for all using (public.is_congregation_group_leader(congregation_id)) with check (public.is_congregation_group_leader(congregation_id));

drop policy "admin manages partnership records" on public.partnership_records;
drop policy "group leader reads partnership records" on public.partnership_records;
create policy "admin reads partnership records" on public.partnership_records
  for select using (public.is_congregation_admin(congregation_id));
create policy "group leader manages partnership records" on public.partnership_records
  for all using (public.is_congregation_group_leader(congregation_id)) with check (public.is_congregation_group_leader(congregation_id));
