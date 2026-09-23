-- Phase 1 multi-tenant hardening.
--
-- 1) Territory map images: the bucket was public, so anyone holding (or guessing) a map URL
--    could view any congregation's map. It's now private. Publishers (no session) and admins
--    get short-lived signed URLs minted server-side by withSignedTerritoryMapUrls
--    (modules/territory/queries.ts), only after the caller's congregation has been verified.
--    Admins keep a read policy on their own congregation's folder because uploadTerritoryMap
--    lists and removes the old image through their own session before uploading the new one.
--
--    Deploy the app code that signs URLs BEFORE running this, or maps stop loading until it
--    ships (signing works against a public bucket too, so code-first is safe).
update storage.buckets set public = false where id = 'territory-maps';

drop policy if exists "public reads territory maps" on storage.objects;

create policy "admin reads own congregation territory maps"
  on storage.objects for select
  using (
    bucket_id = 'territory-maps'
    and public.is_congregation_admin(((storage.foldername(name))[1])::uuid)
  );

-- 2) SECURITY DEFINER functions exposed through /rest/v1/rpc.
--    handle_new_user is only ever a trigger function — nobody should call it directly
--    (triggers don't need EXECUTE on the function to fire).
revoke execute on function public.handle_new_user() from public, anon, authenticated;

--    create_territory_structure already checks is_congregation_admin itself; signed-out
--    callers have no reason to reach it at all.
revoke execute on function public.create_territory_structure(uuid, text, text, integer, integer) from public, anon;
grant execute on function public.create_territory_structure(uuid, text, text, integer, integer) to authenticated, service_role;

--    is_congregation_admin / is_congregation_group_leader / owns_assignment_batch /
--    owns_partnership are deliberately left callable: RLS policies call them as the querying
--    role (including anon), so revoking EXECUTE would turn "no rows" into a permission error.
--    They only answer yes/no about auth.uid() itself, which for anon is always no.

-- 3) Pin search_path on the two remaining functions the linter flags.
alter function public.tms_section_label(integer) set search_path = public;
alter function public.tms_set_do_not_call_at() set search_path = public;
