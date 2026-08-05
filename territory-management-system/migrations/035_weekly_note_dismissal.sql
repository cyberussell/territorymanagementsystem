-- Lets an Admin dismiss a single visit note off the Weekly Notes review list
-- (dashboard/weekly-notes) without touching the underlying visit — the record's real Visit
-- History, Override, and Undo are all untouched, this only hides that one note from the weekly
-- review. Scoped to the visit row itself (not the record) so it naturally un-hides once a new
-- visit is logged for that record, since listWeeklyVisitNotes always keys off the record's
-- current latest visit.
alter table public.territory_record_visits add column if not exists weekly_note_dismissed_at timestamptz;
