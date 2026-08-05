-- Tracks who most recently passed an assigned record to its current Ministry Partner, so the
-- receiving partner (and the Admin) can see "Passed by [Name]" on it. Deliberately its own pair
-- of columns on partnership_records rather than a territory_record_visits row: logVisit()
-- collapses same-day entries into an UPDATE and getLatestVisitResult() reads the single
-- most-recent row to decide the next selectable Status options, so a synthetic "passed" visit
-- would risk overwriting a real visit already logged that day or masking an active Bible
-- Study's true latest status for the next partner.
alter table public.partnership_records add column if not exists passed_from_name text;
alter table public.partnership_records add column if not exists passed_from_at timestamptz;
