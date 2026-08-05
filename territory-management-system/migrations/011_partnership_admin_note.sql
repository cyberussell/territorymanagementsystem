-- Lets a Ministry Partner leave an optional note for the Admin (about today's records or the
-- app itself) at the end of their ministry — skippable, one note per partnership per day.
-- Deliberately not surfaced to the Group Leader anywhere (no RLS policy grants group_leader
-- read access to this column; the admin-only page queries via the service-role client like the
-- rest of the publisher-facing surface, same pattern as Group Leader invites).
alter table public.partnerships add column if not exists admin_note text;
alter table public.partnerships add column if not exists admin_note_at timestamptz;
