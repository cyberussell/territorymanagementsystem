-- Lifts the one-batch-per-Group-Leader-per-day limit 013_group_leader_assignment_ownership.sql
-- introduced. A Group Leader now needs to generate a second, independent "overflow" batch on a
-- day when more publishers show up than the original batch had partnerships for — that batch
-- keeps its own QR/access_token and coexists with the original rather than replacing it, which
-- this unique constraint physically prevented (a second insert with the same
-- congregation_id/assignment_date/created_by would fail). Territory-conflict and ownership
-- rules stay enforced in application code (createAssignment/getTerritoryIdsInUseToday), same as
-- before — this migration only removes the now-incorrect DB-level uniqueness assumption.
alter table public.assignment_batches drop constraint if exists assignment_batches_congregation_date_creator_key;
