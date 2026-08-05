-- Fixes a real regression introduced by 013_group_leader_assignment_ownership.sql: any batch
-- created BEFORE that migration has created_by = NULL (there's no way to know who made it
-- retroactively), and "created_by = auth.uid()" is never true for a NULL column in SQL's
-- three-valued logic — so those pre-existing batches became permanently un-deletable and
-- un-editable by anyone, including whoever originally created them.
--
-- Fix: a NULL-created_by batch is treated as legacy/unowned — any Group Leader in the same
-- congregation may still manage it (matching the exact pre-013 behavior for those rows only).
-- A batch that DOES have a real owner keeps the 013 protection unchanged.

create or replace function public.owns_assignment_batch(target_batch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.assignment_batches b
    where b.id = target_batch_id
      and (b.created_by = auth.uid() or (b.created_by is null and public.is_congregation_group_leader(b.congregation_id)))
  );
$$;

drop policy if exists "group leader updates own assignment batches" on public.assignment_batches;
create policy "group leader updates own assignment batches" on public.assignment_batches
  for update
  using (created_by = auth.uid() or (created_by is null and public.is_congregation_group_leader(congregation_id)))
  with check (created_by = auth.uid() or (created_by is null and public.is_congregation_group_leader(congregation_id)));

drop policy if exists "group leader deletes own assignment batches" on public.assignment_batches;
create policy "group leader deletes own assignment batches" on public.assignment_batches
  for delete
  using (created_by = auth.uid() or (created_by is null and public.is_congregation_group_leader(congregation_id)));
