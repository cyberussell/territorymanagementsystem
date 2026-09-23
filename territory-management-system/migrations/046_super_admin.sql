-- Platform owner ("super admin") role — manages congregations themselves from /tms/platform:
-- creates a congregation and emails its first Administrator an invite link. A super_admin
-- profile has congregation_id = null and no RLS policy grants it anything: every platform
-- screen/action verifies the role server-side (requireSuperAdmin) and then uses the
-- service-role client, same as the rest of this product's cross-row admin paths.
--
-- profiles.role can't be self-assigned: the authenticated role has no insert/update grant on
-- profiles at all (015_protect_profile_role_column.sql). The first super admin is promoted by
-- hand — see SETUP.md §3.
alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('admin', 'group_leader', 'super_admin'));
