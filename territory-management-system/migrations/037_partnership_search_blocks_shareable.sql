-- Territory Management System — makes overflow search-area blocks shareable across partnerships.
-- Russell's call: the section is still a one-time, single choice per partnership (unchanged), but
-- the block-level exclusivity from 026_partnership_search_blocks.sql (unique(block_id,
-- assignment_date), enforced congregation-wide) was wrong — multiple Ministry Partners should be
-- able to search the same block on the same day. Drops the constraint that was the actual
-- enforcement mechanism; app code no longer computes/shows "Already claimed" for blocks (see
-- ChooseSearchScopeForm and getPartnershipByToken's former takenBlockIds).
alter table public.partnership_search_blocks drop constraint if exists partnership_search_blocks_block_id_assignment_date_key;
