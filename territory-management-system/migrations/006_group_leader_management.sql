-- Territory Management System — Group Leader invite/history management.
-- Run against the same dedicated TMS Supabase project as 001-005.
--
-- Confirmed with Russell: Admins invite Group Leaders by name+email (Supabase Admin API invite
-- email, password nominated via the emailed link); revoking access is immediate and always
-- available (bans the login, keeps the profile row as history); deleting a history entry is a
-- separate, permanent action gated to entries at least 6 months old. profiles has no email
-- column today (nothing needed one — every prior read was either "my own profile" via RLS, or
-- joined for full_name only) and no way to distinguish a revoked Group Leader from an active
-- one, so both are added here.

alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists revoked_at timestamptz;
