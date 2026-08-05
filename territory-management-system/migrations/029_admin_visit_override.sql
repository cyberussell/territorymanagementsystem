-- Admin can override the result/notes of a record's latest logged visit (see
-- overrideLatestVisitAction/overrideLatestVisit) — a correction distinct from "Undo Last Visit"
-- (which deletes it outright) or logging a fresh same-day visit (which only collapses into the
-- existing row if it's actually the same calendar day, see logVisit's day-boundary check — an
-- older mistaken entry from a different day needs to be fixed in place instead). This column is
-- purely an audit marker, stamped at override time, shown in Visit History as "Overridden by
-- admin" — the visit's original visited_at/created_by/partner_name are left untouched so
-- authorship of the original submission is preserved.
alter table public.territory_record_visits add column if not exists overridden_by_admin_at timestamptz;
