-- Publisher-facing "Unlocated" -> "They Moved, New Location Known" path — same review-gated
-- shape as removal_recommended_*/correction_recommended_* (012/020_...sql): the record's real
-- address/unit/plus_code/household_members stay untouched until the Admin applies it.
-- resident_name is deliberately NOT part of this recommendation — same person, just a new
-- location, so the name carries over unchanged when the Admin applies it.
alter table public.territory_records add column if not exists move_recommended_at timestamptz;
alter table public.territory_records add column if not exists move_recommended_address text;
alter table public.territory_records add column if not exists move_recommended_unit text;
alter table public.territory_records add column if not exists move_recommended_plus_code text;
alter table public.territory_records add column if not exists move_recommended_household_members int;
alter table public.territory_records add column if not exists move_recommended_notes text;
alter table public.territory_records add column if not exists move_recommended_by text;
