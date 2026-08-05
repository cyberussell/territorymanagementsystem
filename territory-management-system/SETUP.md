# Territory Management System — Setup Guide

The Territory Management System is a standalone multi-congregation SaaS for organizing,
assigning, and tracking territory work during field ministry. This is its own deployment,
proxied from `https://www.cyberussell.com/tms` via a multi-zone rewrite in the main site's
`next.config.ts` (gated on `TMS_ZONE_URL`) — routes here live under `/tms` so that proxy maps
1:1. It runs on its **own Supabase project** (separate from the main site's, the Appointment
System's, and the Laundry Management System's) so it can be deployed and scaled independently.
All code lives in three scoped places:

- `src/app/tms/` — routes (login + the Administrator dashboard)
- `src/lib/territory-management-system/` — core logic (auth, Supabase clients, modules)
- `src/components/territory-management-system/` — UI components
- `territory-management-system/` — migrations + this guide

## 1. Create the dedicated Supabase project

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) → **New project** → name it `territory-management-system`.
2. Open **SQL Editor** and run every file in `territory-management-system/migrations/` in order (001 → 002 → 003 → 004).
3. In **Authentication → Providers → Email**: keep Email enabled.
4. Copy the keys from **Settings → API** into `.env.local`:

```
NEXT_PUBLIC_TMS_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_TMS_SUPABASE_ANON_KEY=sb_publishable_xxxx
TMS_SUPABASE_SERVICE_ROLE_KEY=sb_secret_xxxx   # server-only, never NEXT_PUBLIC
```

## 2. Roles

Two real-account roles share `profiles.role`, both provisioned manually (no public signup):

- **admin** — configures the congregation, its territory structure, and reviews pending
  records; full read/write there. Read-only on assignments (migration 004 moved assignment
  generation off the Admin dashboard — see below).
- **group_leader** — owns assignment generation: picks territory map(s) and a publisher
  headcount, the app computes partnerships and a QR code for the day. Also gets the monitoring
  dashboard (today's assignment, progress, visit-result breakdown). Read-only everywhere else
  (territories, records, congregation settings).

Assignment links are day-scoped: once `assignment_date` is before today (in the congregation's
own timezone), the public QR/partnership links show "This assignment has ended" and reject any
further writes — nothing is deleted, Reports/history keep working normally.

**Publishers are not a `profiles` role at all** — they never sign up or log in. Publisher
access is entirely QR/token-based: scanning the Assignment Summary's QR code opens a public,
unauthenticated page; claiming a partnership stores an opaque token client-side, which is the
only "credential" for the rest of that day's session. See `assignment_batches.access_token` /
`partnerships.claim_token` in `002_assignment_engine.sql`.

## 3. Provisioning a congregation (manual — no public signup)

For each new congregation:

1. **Create the admin's auth user** — in the Supabase dashboard, **Authentication → Users →
   Add user**, or via the Admin API:
   ```
   POST https://xxxx.supabase.co/auth/v1/admin/users
   { "email": "admin@example.com", "password": "...", "email_confirm": true }
   ```
   This fires the `handle_new_user` trigger, which creates their `profiles` row automatically
   (`role` defaults to `'admin'`, `congregation_id` starts `null`).

2. **Create the congregation row** in the SQL Editor:
   ```sql
   insert into public.congregations (name, congregation_number)
   values ('Example Congregation', '12345')
   returning id;
   ```

3. **Link the admin to the congregation**:
   ```sql
   update public.profiles
   set congregation_id = '<congregation id from step 2>'
   where id = '<admin user id from step 1>';
   ```

4. The admin can now sign in at `/tms/login`.

**Provisioning a Group Leader** works the same way, plus one extra update after step 3's
pattern:
```sql
update public.profiles
set role = 'group_leader', congregation_id = '<congregation id>'
where id = '<their auth user id, created the same way as step 1>';
```
They sign in at the same `/tms/login` — the app redirects admins to
`/dashboard` and group leaders to `/group-leader/dashboard` automatically based on `role`.

## 4. What's not built yet

- Public signup/onboarding flow — deferred; provisioning is manual (§3) every pass so far.
- Map section/block boundaries are not drawn on the uploaded image — the map is a reference
  image only; sections/blocks are tracked as counts/labels, not spatial regions.
- Offline Mode (publisher workspace) caches data in the browser's IndexedDB only — clearing
  site data / a different device starts a fresh download; there's no cross-device sync of a
  single partnership's offline queue.
