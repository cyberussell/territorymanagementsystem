-- Tracks which partnership added a given record via the publisher workspace's "Add a New
-- Contact Record" form, independent of assignment_engine's partnership_records (today's
-- assigned-record list). Publisher-added records are never linked into partnership_records
-- (they stay out of "Assigned Records" and go through the same pending-review gate as CSV
-- imports), so this column is what powers a separate "My Added Records" list plus the
-- ownership check on the new publisher-scoped edit/delete actions. Set null (not cascaded) on
-- partnership deletion so the record itself survives as an ordinary pending record for Admin
-- to still review.
alter table public.territory_records
  add column if not exists created_by_partnership_id uuid references public.partnerships(id) on delete set null;

create index if not exists territory_records_created_by_partnership_idx
  on public.territory_records (created_by_partnership_id);
