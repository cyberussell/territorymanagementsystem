-- Backs the temp-password account flow (confirmed with Russell, replacing the emailed
-- invite/reset-link flow for Group Leader accounts, which had repeated expiry/delivery
-- problems traced to @supabase/ssr's browser client not supporting the implicit-flow links
-- Supabase's admin.inviteUserByEmail() always generates). An Admin now invites or resets a
-- Group Leader with a generated temporary password (shown once in the Admin UI, relayed
-- directly); the account is flagged here so the next successful login is redirected to a
-- forced change-password screen before reaching the dashboard.
alter table public.profiles add column if not exists must_change_password boolean not null default false;
