-- Adds 'study_discontinued' as a visit result — distinct from the existing 'discontinued'
-- ("No Positive Response"), which is the dead-end from Potential BS (interest never really
-- took). This one means a Bible Study was genuinely underway (Started Bible Study / Progressive
-- BS) and then stopped. Offered as a third follow-up choice alongside Progressive BS / No
-- Positive Response — see BIBLE_STUDY_FOLLOWUP_RESULTS in records/schema.ts.
alter table public.territory_record_visits drop constraint if exists territory_record_visits_result_check;
alter table public.territory_record_visits add constraint territory_record_visits_result_check
  check (result in (
    'initial_visit', 'return_visit', 'potential_bible_study', 'started_bible_study', 'bible_study',
    'progressing', 'discontinued', 'study_discontinued', 'not_home', 'do_not_call', 'moved', 'other', 'undone'
  ));
