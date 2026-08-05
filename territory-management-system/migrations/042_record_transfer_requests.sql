-- Backs the publisher workspace's new "Search" tab: a Ministry Partner can search today's
-- assigned record contacts congregation-wide (across House To House and every Auxiliary/overflow
-- batch), see who currently has a given record (or that it's unassigned today), and — if it's
-- assigned to someone else — send a request ("Ask") for it rather than an instant transfer like
-- the existing "Pass to Another Partner" feature. The holding partnership must approve or decline
-- before anything actually moves (see resolveRecordTransferRequest/movePartnershipRecord).
--
-- Enforced in application code, not here (same "never trust the client, re-verify server-side"
-- rule as every other publisher action): an Auxiliary/overflow partnership can never request a
-- record currently held by a House To House (non-overflow) partnership — House To House
-- assignments stay protected from Auxiliary "poaching." Auxiliary-to-Auxiliary and
-- House-To-House-to-House-To-House requests are both allowed.
create table if not exists public.record_transfer_requests (
  id uuid primary key default gen_random_uuid(),
  congregation_id uuid not null references public.congregations(id) on delete cascade,
  record_id uuid not null references public.territory_records(id) on delete cascade,
  requesting_partnership_id uuid not null references public.partnerships(id) on delete cascade,
  -- Snapshotted at request time — if the record gets passed/re-assigned before this request is
  -- resolved, resolveRecordTransferRequest re-verifies the record is still actually held by this
  -- partnership before approving, rather than trusting this column blindly by then.
  holding_partnership_id uuid not null references public.partnerships(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists record_transfer_requests_congregation_idx on public.record_transfer_requests (congregation_id);
create index if not exists record_transfer_requests_record_idx on public.record_transfer_requests (record_id);
create index if not exists record_transfer_requests_holding_idx on public.record_transfer_requests (holding_partnership_id);
create index if not exists record_transfer_requests_requesting_idx on public.record_transfer_requests (requesting_partnership_id);
-- At most one pending request per record per requester at a time — repeat-asking the same
-- record before the first request is resolved is a no-op, not a second row.
create unique index if not exists record_transfer_requests_one_pending_per_requester
  on public.record_transfer_requests (record_id, requesting_partnership_id)
  where status = 'pending';

alter table public.record_transfer_requests enable row level security;

-- Admin-only read access (same pattern as every other publisher-facing table — publisher writes
-- go through the service-role client, no publisher Supabase session exists for RLS to apply to).
drop policy if exists "admin reads record transfer requests" on public.record_transfer_requests;
create policy "admin reads record transfer requests" on public.record_transfer_requests
  for select using (public.is_congregation_admin(congregation_id));
