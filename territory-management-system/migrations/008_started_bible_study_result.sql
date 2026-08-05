-- Territory Management System — "Started Bible Study" as its own visit result, distinct from
-- an already-ongoing "Bible Study".
-- Run against the same dedicated TMS Supabase project as 001-007.
--
-- Confirmed with Russell: two separate results rather than reusing 'bible_study' for both —
-- both prompt for who's conducting it, worded differently, and both fold that name into the
-- visit's Notes (no new column needed for the name itself).

alter table public.territory_record_visits drop constraint if exists territory_record_visits_result_check;
alter table public.territory_record_visits add constraint territory_record_visits_result_check
  check (result in ('initial_visit', 'return_visit', 'started_bible_study', 'bible_study', 'not_home', 'do_not_call', 'moved', 'other', 'undone'));
