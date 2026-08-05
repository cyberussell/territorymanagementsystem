-- Record change history — distinct from territory_record_visits (field-ministry visit results).
-- Logs every mutation to a record's own data: created, edited (Admin or a publisher editing
-- their own added record), and a publisher's correction/move/removal recommendation together
-- with the Admin's later apply/dismiss of it. The recommendation's free-text reason/notes is
-- captured verbatim here at recommend-time, since applying or dismissing it clears those columns
-- off territory_records itself — this table is the only place that text survives.
--
-- Retention is 1 year (vs. visits' 6 months, see logVisit's opportunistic cleanup in
-- records/queries.ts) — a deliberately longer window since this is a lower-volume, more
-- consequential audit trail. Cleanup runs the same opportunistic way, on every insert.
create table public.territory_record_history (
  id uuid primary key default gen_random_uuid(),
  congregation_id uuid not null references public.congregations(id) on delete cascade,
  record_id uuid not null references public.territory_records(id) on delete cascade,
  action text not null check (action in (
    'created', 'edited',
    'correction_recommended', 'correction_applied', 'correction_dismissed',
    'move_recommended', 'move_applied', 'move_dismissed',
    'removal_recommended', 'removal_dismissed'
  )),
  summary text not null,
  actor_role text not null check (actor_role in ('admin', 'publisher')),
  -- Plain-text snapshot, not a profiles FK — same "no live join" choice already made for
  -- removal_recommended_by/correction_recommended_by/move_recommended_by on territory_records
  -- (publishers have no accounts to key off of), kept consistent here so an Admin entry reads
  -- the same way years later even if that Admin's account is later renamed or removed.
  actor_name text,
  created_at timestamptz not null default now()
);
create index territory_record_history_record_idx on public.territory_record_history (record_id, created_at desc);
create index territory_record_history_congregation_idx on public.territory_record_history (congregation_id, created_at desc);

alter table public.territory_record_history enable row level security;
create policy "admin manages record history" on public.territory_record_history
  for all using (public.is_congregation_admin(congregation_id)) with check (public.is_congregation_admin(congregation_id));
