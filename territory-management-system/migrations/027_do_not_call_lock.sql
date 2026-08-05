-- Territory Management System — tracks when a record was flagged Do Not Call, powering a
-- 6-month cooldown during which a publisher cannot log any visit against it at all (see
-- isDoNotCallLocked/getSelectableResults). A trigger keeps do_not_call_at in sync automatically
-- regardless of which code path flips do_not_call (a logged 'do_not_call' visit result, an
-- Admin's record-edit checkbox, a publisher's own edit, CSV import) rather than relying on every
-- write site to remember to set/clear it itself.

alter table public.territory_records add column if not exists do_not_call_at timestamptz;

create or replace function public.tms_set_do_not_call_at()
returns trigger
language plpgsql
as $$
begin
  if new.do_not_call and (tg_op = 'INSERT' or not old.do_not_call) then
    new.do_not_call_at = now();
  elsif not new.do_not_call then
    new.do_not_call_at = null;
  end if;
  return new;
end;
$$;

drop trigger if exists tms_territory_records_do_not_call_at on public.territory_records;
create trigger tms_territory_records_do_not_call_at
  before insert or update on public.territory_records
  for each row execute function public.tms_set_do_not_call_at();

-- Backfill: any record already flagged do_not_call before this migration has no way to know
-- exactly when that happened — stamping "now" starts its 6-month cooldown from today rather
-- than leaving it permanently locked (do_not_call true, do_not_call_at null would otherwise
-- read as "always locked" under isDoNotCallLocked's null-check) or permanently unlocked
-- (guessing a past date no one can verify).
update public.territory_records set do_not_call_at = now() where do_not_call and do_not_call_at is null;
