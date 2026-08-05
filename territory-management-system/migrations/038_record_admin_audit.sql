-- Small audit trail for the Admin's own "Add a Contact Record" / "Edit Contact Record" forms —
-- stamped only from createRecordAction/updateRecordAction (records/queries.ts's createRecord's
-- addedByAdminId / updateRecord's editedByAdminId), never for publisher-added/edited or
-- CSV-imported records. Powers a small "Added by X on Y" / "Last edited by X on Y" note on the
-- record detail page. on delete set null so a later-deleted Admin account doesn't block deleting
-- their profile row — the note just stops resolving a name.
alter table public.territory_records add column if not exists admin_added_by uuid references public.profiles(id) on delete set null;
alter table public.territory_records add column if not exists admin_added_at timestamptz;
alter table public.territory_records add column if not exists admin_edited_by uuid references public.profiles(id) on delete set null;
alter table public.territory_records add column if not exists admin_edited_at timestamptz;
