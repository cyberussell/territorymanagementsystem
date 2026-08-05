-- Closes a privilege-escalation gap flagged by the production-readiness audit: profiles' only
-- RLS policy ("own profile") is "for all" at row-level only (id = auth.uid()), so it can't stop
-- an authenticated user from PATCHing their own role/congregation_id/revoked_at directly via
-- the REST API. Unlike the same bug class already fixed in the Appointment System and LMS
-- (a billing-tier self-upgrade nuisance), role and congregation_id ARE the actual auth gate
-- here (requireRole() checks profile.role) — this is a full privilege escalation / cross-tenant
-- breach, not just a free-feature bypass.
--
-- Every real profile mutation in this app (invites, revoke/restore access) already goes through
-- the service-role client (unaffected by this — service_role bypasses these grants entirely),
-- and there is no legitimate session-client write path to profiles anywhere in the codebase, so
-- this revokes the authenticated role's write access outright rather than granting back a
-- column allowlist.

revoke insert, update on public.profiles from authenticated;
