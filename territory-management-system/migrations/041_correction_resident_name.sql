-- Lets a publisher recommend a corrected Resident Name alongside the existing Plus Code/
-- Territory/Section/Block/Household Members correction fields (see RecommendCorrectionForm) —
-- e.g. a misspelled name or a household member's name recorded incorrectly. Same review-gated
-- shape as every other correction_recommended_* column: nothing changes on the record until the
-- Admin applies it.
alter table public.territory_records add column if not exists correction_recommended_resident_name text;
