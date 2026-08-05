-- Simple fixed-window rate limiting counter for TMS's public/unauthenticated endpoints (the
-- publisher QR/token workflow) and the admin/Group Leader login + password-reset actions —
-- same pattern as the Appointment System's 017_rate_limits.sql and LMS's 016_rate_limits.sql.
-- No RLS policies needed — only ever touched via the service-role client from server code,
-- never exposed to the anon key.
create table public.rate_limits (
  key text primary key,
  count integer not null default 1,
  window_start timestamptz not null default now()
);

revoke all on public.rate_limits from anon, authenticated;
