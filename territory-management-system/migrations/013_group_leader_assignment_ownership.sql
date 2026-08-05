-- Territory Management System — multiple Group Leaders can now run concurrent assignment
-- batches on the same day (e.g. one covers North territories, another covers South) instead of
-- sharing exactly one batch per congregation per day. Each batch belongs to the Group Leader
-- who created it; no two active batches on the same day may claim the same territory (enforced
-- in application code — see createAssignment). Run against the same dedicated TMS Supabase
-- project as 001-012.

-- Nullable: existing batches (created before this column existed) keep working — Postgres
-- treats NULL != NULL for uniqueness purposes, so old rows are automatically exempt from the
-- new per-creator uniqueness rule below rather than needing a backfill.
alter table public.assignment_batches add column if not exists created_by uuid references public.profiles(id) on delete set null;

alter table public.assignment_batches drop constraint if exists assignment_batches_congregation_id_assignment_date_key;
alter table public.assignment_batches add constraint assignment_batches_congregation_date_creator_key
  unique (congregation_id, assignment_date, created_by);

-- security definer + fixed search_path, same pattern as is_congregation_admin/
-- is_congregation_group_leader (001/003) — lets the child tables' RLS policies below check
-- batch ownership without recursing back through assignment_batches' own RLS.
create or replace function public.owns_assignment_batch(target_batch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.assignment_batches
    where id = target_batch_id and created_by = auth.uid()
  );
$$;

create or replace function public.owns_partnership(target_partnership_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.partnerships p
    where p.id = target_partnership_id and public.owns_assignment_batch(p.batch_id)
  );
$$;

-- assignment_batches: reads stay congregation-wide (every Group Leader can still see every
-- batch today, for coordination and reports) — only writes narrow to "the batch I created."
drop policy if exists "group leader manages assignment batches" on public.assignment_batches;
create policy "group leader reads assignment batches" on public.assignment_batches
  for select using (public.is_congregation_group_leader(congregation_id));
create policy "group leader creates assignment batches" on public.assignment_batches
  for insert with check (public.is_congregation_group_leader(congregation_id) and created_by = auth.uid());
create policy "group leader updates own assignment batches" on public.assignment_batches
  for update using (created_by = auth.uid()) with check (created_by = auth.uid());
create policy "group leader deletes own assignment batches" on public.assignment_batches
  for delete using (created_by = auth.uid());

drop policy if exists "group leader manages assignment batch territories" on public.assignment_batch_territories;
create policy "group leader reads assignment batch territories" on public.assignment_batch_territories
  for select using (public.is_congregation_group_leader(congregation_id));
create policy "group leader creates own assignment batch territories" on public.assignment_batch_territories
  for insert with check (public.owns_assignment_batch(batch_id));
create policy "group leader updates own assignment batch territories" on public.assignment_batch_territories
  for update using (public.owns_assignment_batch(batch_id)) with check (public.owns_assignment_batch(batch_id));
create policy "group leader deletes own assignment batch territories" on public.assignment_batch_territories
  for delete using (public.owns_assignment_batch(batch_id));

drop policy if exists "group leader manages partnerships" on public.partnerships;
create policy "group leader reads partnerships" on public.partnerships
  for select using (public.is_congregation_group_leader(congregation_id));
create policy "group leader creates own partnerships" on public.partnerships
  for insert with check (public.owns_assignment_batch(batch_id));
create policy "group leader updates own partnerships" on public.partnerships
  for update using (public.owns_assignment_batch(batch_id)) with check (public.owns_assignment_batch(batch_id));
create policy "group leader deletes own partnerships" on public.partnerships
  for delete using (public.owns_assignment_batch(batch_id));

drop policy if exists "group leader manages partnership records" on public.partnership_records;
create policy "group leader reads partnership records" on public.partnership_records
  for select using (public.is_congregation_group_leader(congregation_id));
create policy "group leader creates own partnership records" on public.partnership_records
  for insert with check (public.owns_partnership(partnership_id));
create policy "group leader updates own partnership records" on public.partnership_records
  for update using (public.owns_partnership(partnership_id)) with check (public.owns_partnership(partnership_id));
create policy "group leader deletes own partnership records" on public.partnership_records
  for delete using (public.owns_partnership(partnership_id));
