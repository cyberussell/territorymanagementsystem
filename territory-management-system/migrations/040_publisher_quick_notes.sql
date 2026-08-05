-- Lets a Ministry Partner send a lightweight, unstructured note to the Admin at any point during
-- their ministry — not just the single end-of-ministry note already covered by
-- partnerships.admin_note (011_partnership_admin_note.sql). Two entry points feed this same
-- table: (1) a quick "I found someone, here's their info" alternative to the full territory-
-- scoped Add Record form, and (2) an alternative to "Recommend New Location" on an Unlocated
-- record when the publisher doesn't have (or want to fill in) the structured address/Plus
-- Code/territory-section-block fields that path needs for the Admin to auto-apply the move.
-- Deliberately separate from admin_note (a partnership can only have one of those, this can have
-- many) and deliberately no territory/section/block/address fields — that's the whole point of
-- offering this as the "I don't have the structured details" alternative. Same admin-only
-- visibility pattern as admin_note: no RLS policy below grants group_leader read access, and the
-- admin Notes page queries via the service-role client, same as the rest of the publisher-facing
-- surface.
create table if not exists public.partnership_quick_notes (
  id uuid primary key default gen_random_uuid(),
  congregation_id uuid not null references public.congregations(id) on delete cascade,
  partnership_id uuid not null references public.partnerships(id) on delete cascade,
  name text not null,
  phone text,
  notes text not null,
  created_at timestamptz not null default now()
);
create index if not exists partnership_quick_notes_partnership_idx on public.partnership_quick_notes (partnership_id);
create index if not exists partnership_quick_notes_congregation_idx on public.partnership_quick_notes (congregation_id);

alter table public.partnership_quick_notes enable row level security;

-- Same shape as partnership_search_blocks' RLS (026_partnership_search_blocks.sql) — reads
-- scoped to congregation admin, writes go through the publisher's service-role action (no
-- publisher Supabase session exists for RLS to apply to), so this is defense-in-depth, not the
-- real gate.
drop policy if exists "admin reads partnership quick notes" on public.partnership_quick_notes;
create policy "admin reads partnership quick notes" on public.partnership_quick_notes
  for select using (public.is_congregation_admin(congregation_id));
