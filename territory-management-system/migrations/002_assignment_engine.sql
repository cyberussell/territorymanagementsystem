-- Territory Management System — Assignment Engine + Publisher Workflow.
-- Run against the same dedicated TMS Supabase project as 001_init.sql.
--
-- Adds: Plus Codes on records, the real visit-result set, and the assignment/partnership
-- schema that backs the (unauthenticated, token-scoped) Publisher Workflow. Publishers never
-- get real Supabase accounts — every publisher-facing write goes through a Server Action using
-- the service-role client, which validates the request's opaque token(s) against these tables
-- in application code before touching anything. RLS below only ever grants the congregation
-- admin, same flat congregation_id-based policy shape as 001_init.sql — there are deliberately
-- no anonymous/public policies here.

create extension if not exists pgcrypto;

-- ── territory_records: Plus Codes + a real publisher-sourced provenance value ───────────
alter table public.territory_records add column plus_code text;

alter table public.territory_records drop constraint territory_records_source_check;
alter table public.territory_records add constraint territory_records_source_check
  check (source in ('manual', 'csv_import', 'publisher'));

-- ── territory_record_visits: the real visit-result set (replaces the phase-1 placeholder) ─
alter table public.territory_record_visits drop constraint territory_record_visits_result_check;
alter table public.territory_record_visits add constraint territory_record_visits_result_check
  check (result in ('initial_visit', 'return_visit', 'bible_study', 'not_home', 'do_not_call', 'moved'));

-- ── Assignment Batches (one per congregation per calendar day) ──────────────────────────
create table public.assignment_batches (
  id uuid primary key default gen_random_uuid(),
  congregation_id uuid not null references public.congregations(id) on delete cascade,
  assignment_date date not null,
  requested_partnership_count int not null check (requested_partnership_count >= 1),
  access_token text not null unique default encode(gen_random_bytes(16), 'hex'),
  created_at timestamptz not null default now(),
  unique (congregation_id, assignment_date)
);
create index assignment_batches_congregation_idx on public.assignment_batches (congregation_id);
create index assignment_batches_token_idx on public.assignment_batches (access_token);

-- ── Territories selected for a batch (many-to-many: "Select one or multiple territories") ─
create table public.assignment_batch_territories (
  id uuid primary key default gen_random_uuid(),
  congregation_id uuid not null references public.congregations(id) on delete cascade,
  batch_id uuid not null references public.assignment_batches(id) on delete cascade,
  territory_id uuid not null references public.territories(id) on delete cascade,
  unique (batch_id, territory_id)
);
create index assignment_batch_territories_batch_idx on public.assignment_batch_territories (batch_id);

-- ── Partnerships (2-3 publishers each, in practice — the app tracks the partnership as a
--    unit, not individual publisher identities) ──────────────────────────────────────────
create table public.partnerships (
  id uuid primary key default gen_random_uuid(),
  congregation_id uuid not null references public.congregations(id) on delete cascade,
  batch_id uuid not null references public.assignment_batches(id) on delete cascade,
  sequence int not null,
  name text not null,
  claim_token text not null unique default encode(gen_random_bytes(16), 'hex'),
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (batch_id, sequence)
);
create index partnerships_congregation_idx on public.partnerships (congregation_id);
create index partnerships_batch_idx on public.partnerships (batch_id);
create index partnerships_token_idx on public.partnerships (claim_token);

-- ── Records assigned to a partnership, in sequential (never randomized) order ────────────
create table public.partnership_records (
  id uuid primary key default gen_random_uuid(),
  congregation_id uuid not null references public.congregations(id) on delete cascade,
  partnership_id uuid not null references public.partnerships(id) on delete cascade,
  record_id uuid not null references public.territory_records(id) on delete cascade,
  sequence int not null,
  completed_at timestamptz,
  unique (partnership_id, record_id)
);
create index partnership_records_congregation_idx on public.partnership_records (congregation_id);
create index partnership_records_partnership_idx on public.partnership_records (partnership_id);
create index partnership_records_record_idx on public.partnership_records (record_id);

-- ── Row Level Security ────────────────────────────────────────────────────────────────────
alter table public.assignment_batches enable row level security;
alter table public.assignment_batch_territories enable row level security;
alter table public.partnerships enable row level security;
alter table public.partnership_records enable row level security;

create policy "admin manages assignment batches" on public.assignment_batches
  for all using (public.is_congregation_admin(congregation_id)) with check (public.is_congregation_admin(congregation_id));
create policy "admin manages assignment batch territories" on public.assignment_batch_territories
  for all using (public.is_congregation_admin(congregation_id)) with check (public.is_congregation_admin(congregation_id));
create policy "admin manages partnerships" on public.partnerships
  for all using (public.is_congregation_admin(congregation_id)) with check (public.is_congregation_admin(congregation_id));
create policy "admin manages partnership records" on public.partnership_records
  for all using (public.is_congregation_admin(congregation_id)) with check (public.is_congregation_admin(congregation_id));
