-- When a publisher taps "Update" on an assigned record (e.g. the Plus Code is wrong) and
-- recommends a correction, it lands here for the Admin to review — same pattern as
-- removal_recommended_* (012_removal_recommendation.sql): the record is never edited directly
-- by the publisher, only flagged with what it should be and why. The Admin can then apply the
-- recommended Plus Code or dismiss the recommendation.
alter table public.territory_records add column if not exists correction_recommended_at timestamptz;
alter table public.territory_records add column if not exists correction_recommended_plus_code text;
alter table public.territory_records add column if not exists correction_recommended_reason text;
alter table public.territory_records add column if not exists correction_recommended_by text;
