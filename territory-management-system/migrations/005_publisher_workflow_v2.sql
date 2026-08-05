-- Territory Management System — Publisher workflow v2.
-- Run against the same dedicated TMS Supabase project as 001-004.
--
-- Confirmed with Russell: two new visit results — 'other' (publisher-selectable, requires a
-- note) and 'undone' (system-only, written when a Ministry Partner ends their session early;
-- never offered as a manual dropdown choice). Also adds ended_early_at to partnerships so an
-- early-terminated session is distinguishable from a normally-completed one.

alter table public.territory_record_visits drop constraint if exists territory_record_visits_result_check;
alter table public.territory_record_visits add constraint territory_record_visits_result_check
  check (result in ('initial_visit', 'return_visit', 'bible_study', 'not_home', 'do_not_call', 'moved', 'other', 'undone'));

alter table public.partnerships add column if not exists ended_early_at timestamptz;
