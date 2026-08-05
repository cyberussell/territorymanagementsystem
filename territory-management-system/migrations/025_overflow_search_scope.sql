-- Territory Management System — Overflow assignments can narrow to a specific search area.
-- Run against the same dedicated TMS Supabase project as 001-024.
--
-- An overflow batch (024_batch_is_overflow.sql) starts with zero assigned records by design —
-- publishers "go canvass/search" instead of visiting pre-assigned households. Confirmed with
-- Russell: the Group Leader can optionally narrow that search to one section + a chosen set of
-- blocks within it, so the publisher workspace can show what (if anything) already exists there
-- (read-only, to avoid duplicate contact records) and its own pin map for that area. Optional —
-- an overflow batch with no rows here behaves exactly as before (unscoped search across its
-- whole territory).

create table if not exists public.assignment_batch_search_blocks (
  id uuid primary key default gen_random_uuid(),
  congregation_id uuid not null references public.congregations(id) on delete cascade,
  batch_id uuid not null references public.assignment_batches(id) on delete cascade,
  section_id uuid not null references public.territory_sections(id) on delete cascade,
  block_id uuid not null references public.territory_blocks(id) on delete cascade,
  unique (batch_id, block_id)
);
create index if not exists assignment_batch_search_blocks_batch_idx on public.assignment_batch_search_blocks (batch_id);
create index if not exists assignment_batch_search_blocks_block_idx on public.assignment_batch_search_blocks (block_id);

alter table public.assignment_batch_search_blocks enable row level security;

-- Same shape as assignment_batch_territories' own RLS (013_group_leader_assignment_ownership.sql):
-- reads stay congregation-wide (every Group Leader can see today's batches for coordination),
-- writes scoped to "the batch I created" via the existing owns_assignment_batch() helper. Admin
-- keeps read-only access, same as every other assignment table (004). drop-if-exists before each
-- create makes this safe to re-run (e.g. after a partial first attempt).
drop policy if exists "admin reads assignment batch search blocks" on public.assignment_batch_search_blocks;
create policy "admin reads assignment batch search blocks" on public.assignment_batch_search_blocks
  for select using (public.is_congregation_admin(congregation_id));
drop policy if exists "group leader reads assignment batch search blocks" on public.assignment_batch_search_blocks;
create policy "group leader reads assignment batch search blocks" on public.assignment_batch_search_blocks
  for select using (public.is_congregation_group_leader(congregation_id));
drop policy if exists "group leader creates own assignment batch search blocks" on public.assignment_batch_search_blocks;
create policy "group leader creates own assignment batch search blocks" on public.assignment_batch_search_blocks
  for insert with check (public.owns_assignment_batch(batch_id));
drop policy if exists "group leader deletes own assignment batch search blocks" on public.assignment_batch_search_blocks;
create policy "group leader deletes own assignment batch search blocks" on public.assignment_batch_search_blocks
  for delete using (public.owns_assignment_batch(batch_id));
