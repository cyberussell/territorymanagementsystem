-- One-time backfill, not a schema change: renames any partnership still sitting at its
-- auto-generated default name ("Ministry Partner N") that actually belongs to a Language
-- Searcher (Auxiliary/overflow) batch. Those rows were named before defaultPartnershipName
-- (043_record_assignment_offers.sql-era queries.ts change) shipped — that fix only changed
-- naming for partnerships created going forward, never rows already in the database.
--
-- Only touches rows still at the exact default pattern — the same "is this still an unclaimed
-- default name" check PartnershipRenameForm/releasePartnership use — so a partnership a
-- publisher has already claimed and renamed (e.g. "John & Mary") is left untouched.
update public.partnerships p
set name = regexp_replace(p.name, '^Ministry Partner ', 'Language Searcher ')
from public.assignment_batches b
where p.batch_id = b.id
  and b.is_overflow = true
  and p.name ~ '^Ministry Partner \d+$';
