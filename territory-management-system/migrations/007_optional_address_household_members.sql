-- Territory Management System — optional address + Household Members for the new
-- cross-territory CSV import.
-- Run against the same dedicated TMS Supabase project as 001-006.
--
-- The new global records import (name, plus code, territory name, section, block,
-- household members, note) has no address column at all — Plus Code is the location
-- identifier for that format. address was NOT NULL with no default, so imported rows would
-- fail without one; giving it the same "not null default ''" shape as unit/resident_name/
-- notes makes it optional everywhere (manual forms, CSV import) without changing its type.
-- household_members is new — a simple headcount captured at the door, not derived from
-- anything else in the schema.

alter table public.territory_records alter column address set default '';
alter table public.territory_records add column if not exists household_members integer
  check (household_members is null or household_members >= 0);
