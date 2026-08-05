-- Extends the existing Plus Code correction-recommendation flow (see
-- 020_correction_recommendation.sql) to also let a publisher recommend a Section/Block change —
-- same review-gated shape: the record's real section_id/block_id are untouched until the Admin
-- applies it. Nullable, on delete set null (a deleted Section/Block shouldn't leave a broken
-- reference on a pending recommendation).
alter table public.territory_records add column if not exists correction_recommended_section_id uuid references public.territory_sections(id) on delete set null;
alter table public.territory_records add column if not exists correction_recommended_block_id uuid references public.territory_blocks(id) on delete set null;
