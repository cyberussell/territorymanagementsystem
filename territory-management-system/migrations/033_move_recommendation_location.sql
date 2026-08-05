-- Extends the Move recommendation flow (032_move_recommendation.sql) to also let a publisher
-- recommend a different Territory/Section/Block for the new location — the moved person may now
-- live in a different barangay entirely, not just a different address within the same one. Same
-- review-gated shape: the record's real territory_id/section_id/block_id are untouched until
-- the Admin applies it.
--
-- IMPORTANT: this is territory_records' THIRD set of FKs to territories/territory_sections/
-- territory_blocks (after the record's own territory_id/section_id/block_id, and
-- correction_recommended_section_id/block_id from 030). Every unqualified embed of these three
-- tables from territory_records anywhere in the codebase needs a !column disambiguation hint or
-- PostgREST silently returns zero rows for the whole query — this exact failure mode already
-- happened once from 030 (see territory-management-ambiguous-fk-embed-fix-v1) and was audited
-- and fixed across the codebase in the same change as this migration.
alter table public.territory_records add column if not exists move_recommended_territory_id uuid references public.territories(id) on delete set null;
alter table public.territory_records add column if not exists move_recommended_section_id uuid references public.territory_sections(id) on delete set null;
alter table public.territory_records add column if not exists move_recommended_block_id uuid references public.territory_blocks(id) on delete set null;
