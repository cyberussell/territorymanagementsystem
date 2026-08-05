-- Adds 'potential_bible_study' as a visit result. It takes over the default-pool slot that
-- 'started_bible_study' used to occupy (first sign of interest, "Potential BS") — 'started_bible_study'
-- itself becomes a locked follow-up choice reachable only once a record is already 'potential_bible_study'
-- (confirming a real study actually began), narrowing further to 'bible_study'/'discontinued' from there.
-- See records/schema.ts's getSelectableResults() for the full funnel logic.
alter table public.territory_record_visits drop constraint if exists territory_record_visits_result_check;
alter table public.territory_record_visits add constraint territory_record_visits_result_check
  check (result in (
    'initial_visit', 'return_visit', 'potential_bible_study', 'started_bible_study', 'bible_study',
    'progressing', 'discontinued', 'not_home', 'do_not_call', 'moved', 'other', 'undone'
  ));
