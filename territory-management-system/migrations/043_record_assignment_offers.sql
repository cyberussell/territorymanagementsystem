-- Lets a Group Leader manually offer a specific still-unassigned contact record to a specific
-- Ministry Partner (House To House or Auxiliary Group alike) — the manual complement to the bulk
-- assignment engine, for whatever calculateAssignment left over past a partnership's
-- maxPerPartnership cap. Not an instant assignment: the target partnership must accept or
-- decline before the record actually attaches to partnership_records (see
-- resolveRecordAssignmentOffer/createRecordAssignmentOffer) — the Group Leader is choosing on
-- someone else's behalf, not claiming for their own work, so the partner keeps the final say.
-- Deliberately a separate table from record_transfer_requests (042): that table's flow is a
-- Ministry Partner asking the CURRENT HOLDER of a record they want; this one has no holder at
-- all (the record is unassigned) and the Group Leader — not a peer partner — initiates it, so
-- accepting inserts a fresh partnership_records row rather than moving one from someone else.
create table if not exists public.record_assignment_offers (
  id uuid primary key default gen_random_uuid(),
  congregation_id uuid not null references public.congregations(id) on delete cascade,
  record_id uuid not null references public.territory_records(id) on delete cascade,
  offered_to_partnership_id uuid not null references public.partnerships(id) on delete cascade,
  offered_by uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists record_assignment_offers_congregation_idx on public.record_assignment_offers (congregation_id);
create index if not exists record_assignment_offers_record_idx on public.record_assignment_offers (record_id);
create index if not exists record_assignment_offers_partnership_idx on public.record_assignment_offers (offered_to_partnership_id);
-- At most one pending offer per record at a time — createRecordAssignmentOffer deletes any
-- existing pending offer for the record before inserting a new one (a Group Leader redirecting
-- an offer to a different partner before the first one responds is a normal change of mind, not
-- a race to prevent), and this index is the backstop against that ever double-inserting.
create unique index if not exists record_assignment_offers_one_pending_per_record
  on public.record_assignment_offers (record_id)
  where status = 'pending';

alter table public.record_assignment_offers enable row level security;

-- Group Leader creates/reads/cancels offers for their own congregation — same "for all" shape as
-- migration 004's assignment-table policies (assignment generation is a Group Leader
-- responsibility, and manually offering a leftover record is part of that same job).
drop policy if exists "group leader manages record assignment offers" on public.record_assignment_offers;
create policy "group leader manages record assignment offers" on public.record_assignment_offers
  for all using (public.is_congregation_group_leader(congregation_id)) with check (public.is_congregation_group_leader(congregation_id));

-- Admin-only read access, same pattern as record_transfer_requests (042) — publisher reads/
-- responses go through the service-role client (see actions/publisher.ts), same as
-- record_transfer_requests, so no publisher-facing RLS policy is needed here.
drop policy if exists "admin reads record assignment offers" on public.record_assignment_offers;
create policy "admin reads record assignment offers" on public.record_assignment_offers
  for select using (public.is_congregation_admin(congregation_id));
