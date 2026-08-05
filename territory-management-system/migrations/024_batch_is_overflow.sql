-- Distinguishes an overflow batch (createOverflowAssignmentAction, forceZeroRecords) from a
-- Group Leader's original assignment for the day, now that both can coexist
-- (023_multiple_batches_per_group_leader.sql). Needed for the Group Leader dashboard's batch
-- switcher to label them "Assignment" vs "Overflow" rather than guessing from array order,
-- which would break the moment the original batch is deleted while an overflow one remains.
alter table public.assignment_batches add column if not exists is_overflow boolean not null default false;
