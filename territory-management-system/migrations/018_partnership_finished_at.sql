-- Adds a real "this partnership finished normally" signal, distinct from ended_early_at
-- (which specifically means unfinished records got marked undone). Needed because a
-- zero-record ("searching a fresh territory") partnership's completedCount >= recordCount is
-- vacuously true from the moment the batch is created — before anyone has even claimed it —
-- which made the Group Leader's Home tab show the all-done summary instead of the QR code for
-- zero-record territories, and gave no reliable "are we actually done" signal for any
-- partnership whose record math alone can't answer that question.
alter table public.partnerships add column if not exists finished_at timestamptz;
