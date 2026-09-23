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

## 3. Provisioning congregations (platform console)

Congregations are added from the **platform console** at `/tms/platform`, by a `super_admin`
account. It creates the congregation and emails its first Administrator an invite link. The
Administrator sets a password from that link, then signs in at `/tms/login`.

### One-time setup

1. **Invite email template.** Paste `territory-management-system/email-templates/invite-user.html`
   into **Authentication → Emails → Invite user** (subject: "You're invited to manage your
   congregation's territories"). Its link goes straight to `/tms/set-password?token_hash=…`, which
   works on any device; Supabase's default template link does not work reliably with this app.
2. **Custom SMTP** (recommended). Supabase's built-in email sender only allows a few emails per
   hour. Set up an SMTP provider under **Authentication → Emails → SMTP settings** before
   inviting more than a couple of congregations at once.
3. **Create the super admin account.** In **Authentication → Users → Add user**, create the account
   with a password and "Auto Confirm User" checked. Then run:
   ```sql
   update public.profiles
   set role = 'super_admin', congregation_id = null, full_name = 'Your Name'
   where id = (select id from auth.users where email = 'you@example.com');
   ```
   Signing in with that account at `/tms/login` goes to `/tms/platform`.

### Adding a congregation

In `/tms/platform`, fill in the congregation name, congregation number, time zone and the
Administrator's email (name optional), then **Add Congregation & Send Invite**. The table shows
each Administrator as "Invite pending" until they sign in for the first time; **Resend** sends
the invite email again.

**Group Leaders** are still invited by their congregation's Administrator from the Group
Leaders page (temporary password, no email).

## 4. What's not built yet

- Public self-service signup — congregations are added by a super admin (§3), not by themselves.
- Map section/block boundaries are not drawn on the uploaded image — the map is a reference
  image only; sections/blocks are tracked as counts/labels, not spatial regions.
- Offline Mode (publisher workspace) caches data in the browser's IndexedDB only — clearing
  site data / a different device starts a fresh download; there's no cross-device sync of a
  single partnership's offline queue.
