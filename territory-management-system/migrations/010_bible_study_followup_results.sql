-- Adds 'progressing' and 'discontinued' as visit results — once a record's most recent visit is
-- 'bible_study' (an ongoing study, not the first-time 'started_bible_study'), the next visit's
-- Status choices narrow in the UI to just Moved/Discontinued/Progressing.
alter table public.territory_record_visits drop constraint if exists territory_record_visits_result_check;
alter table public.territory_record_visits add constraint territory_record_visits_result_check
  check (result in (
    'initial_visit', 'return_visit', 'started_bible_study', 'bible_study', 'progressing',
    'discontinued', 'not_home', 'do_not_call', 'moved', 'other', 'undone'
  ));
