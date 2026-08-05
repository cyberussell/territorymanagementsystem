-- Extends the existing correction-recommendation flow (see 020_correction_recommendation.sql,
-- 030_correction_section_block.sql) to also let a publisher recommend a Household Members
-- count change — same review-gated shape: the record's real household_members is untouched
-- until the Admin applies it.
alter table public.territory_records add column if not exists correction_recommended_household_members int;
