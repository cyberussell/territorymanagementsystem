-- Territory Management System — moves the overflow search-scope choice from the Group Leader
-- (batch-level, 025_overflow_search_scope.sql) to each individual Ministry Partner
-- (partnership-level), a one-time locked-in choice made after they claim their partnership.
-- Confirmed with Russell: migration 025 has no real data yet, safe to supersede outright rather
-- than migrate it forward.

drop table if exists public.assignment_batch_search_blocks;

-- One row per block a partnership has locked in for their search area. The
-- unique(block_id, assignment_date) constraint IS the overlap-prevention mechanism — it
-- physically prevents two different partnerships from ever locking the same block on the same
-- day, congregation-wide (block ids are already globally unique across congregations, so no
-- separate congregation_id needs to be part of the key). assignment_date is denormalized from
-- the partnership's own batch at insert time rather than joined at constraint-check time,
-- since Postgres unique constraints can't reference another table's column.
create table if not exists public.partnership_search_blocks (
  id uuid primary key default gen_random_uuid(),
  congregation_id uuid not null references public.congregations(id) on delete cascade,
  partnership_id uuid not null references public.partnerships(id) on delete cascade,
  section_id uuid not null references public.territory_sections(id) on delete cascade,
  block_id uuid not null references public.territory_blocks(id) on delete cascade,
  assignment_date date not null,
  created_at timestamptz not null default now(),
  unique (block_id, assignment_date)
);
create index if not exists partnership_search_blocks_partnership_idx on public.partnership_search_blocks (partnership_id);
create index if not exists partnership_search_blocks_date_idx on public.partnership_search_blocks (assignment_date);

alter table public.partnership_search_blocks enable row level security;

-- Same shape as partnership_records' own RLS (013_group_leader_assignment_ownership.sql):
-- reads stay congregation-wide, writes scoped to "a partnership in a batch I created" via the
-- existing owns_partnership() helper. In practice every write actually goes through the
-- publisher's service-role action (chooseSearchScopeAction — no publisher Supabase session
-- exists for RLS to apply to), so this is defense-in-depth/consistency, not the real gate.
-- drop-if-exists before each create makes this safe to re-run (e.g. after a partial attempt).
drop policy if exists "admin reads partnership search blocks" on public.partnership_search_blocks;
create policy "admin reads partnership search blocks" on public.partnership_search_blocks
  for select using (public.is_congregation_admin(congregation_id));
drop policy if exists "group leader reads partnership search blocks" on public.partnership_search_blocks;
create policy "group leader reads partnership search blocks" on public.partnership_search_blocks
  for select using (public.is_congregation_group_leader(congregation_id));
drop policy if exists "group leader creates own partnership search blocks" on public.partnership_search_blocks;
create policy "group leader creates own partnership search blocks" on public.partnership_search_blocks
  for insert with check (public.owns_partnership(partnership_id));
drop policy if exists "group leader deletes own partnership search blocks" on public.partnership_search_blocks;
create policy "group leader deletes own partnership search blocks" on public.partnership_search_blocks
  for delete using (public.owns_partnership(partnership_id));
