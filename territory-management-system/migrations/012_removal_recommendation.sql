-- When a publisher marks a record "Moved" and chooses "Recommend for Admin Removal" (rather
-- than correcting the contact info themselves), it lands here for the Admin to review — the
-- Admin can then actually delete the record or dismiss the recommendation.
alter table public.territory_records add column if not exists removal_recommended_at timestamptz;
alter table public.territory_records add column if not exists removal_recommended_reason text;
alter table public.territory_records add column if not exists removal_recommended_by text;
