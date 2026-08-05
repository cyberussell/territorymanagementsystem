-- Persists unexpected failures from the publisher-facing (unauthenticated) write surface so
-- they're queryable after the fact instead of living only in Vercel's ephemeral function logs —
-- closes the "no error tracking anywhere" gap flagged by the production-readiness audit.
-- Deliberately its own small table rather than TMS reusing another product's `events` table
-- (each TMS product is fully isolated, own Supabase project).
create table public.error_logs (
  id uuid primary key default gen_random_uuid(),
  congregation_id uuid references public.congregations(id) on delete set null,
  source text not null,
  message text not null,
  stack text,
  created_at timestamptz not null default now()
);

revoke all on public.error_logs from anon, authenticated;
