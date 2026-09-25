# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

Territory Management System (TMS): a standalone, multi-congregation SaaS for organizing,
assigning, and tracking field-ministry territory work. Next.js 16 (App Router, React 19,
Server Actions) + Supabase (its **own** project, separate from the main cyberussell.com site)
+ Tailwind v4. Deployed on Vercel in `hnd1` (Tokyo, next to the Supabase DB — see
`vercel.json`) and proxied at `https://www.cyberussell.com/tms` via a multi-zone rewrite.

See `README.md` and `territory-management-system/SETUP.md` for deploy and Supabase setup.

## Commands

```bash
npm install
npm run dev     # http://localhost:3000/tms/login
npm run build   # also the typecheck — there is no separate lint/tsc script
npm test        # vitest run
```

Env vars (copy `.env.example` → `.env.local`, gitignored; tests load it too via `vitest.setup.ts`):
`NEXT_PUBLIC_TMS_SUPABASE_URL`, `NEXT_PUBLIC_TMS_SUPABASE_ANON_KEY`,
`TMS_SUPABASE_SERVICE_ROLE_KEY` (server-only, never `NEXT_PUBLIC_`).

## Layout

- `src/app/tms/` — all routes. Must stay under `/tms` so the proxy's `/tms/:path+` rewrite maps 1:1.
  - `actions/` — Server Actions, one file per area (`records.ts`, `publisher.ts`, `platform.ts`, …); return `ActionResult` (`{ error?: string }`) from `actions/shared.ts`.
  - `dashboard/` — Administrator; `group-leader/` — Group Leader; `platform/` — super admin console.
  - `assignment/[batchToken]/...` — public, unauthenticated publisher pages (QR/token access).
- `src/lib/territory-management-system/` — core logic.
  - `modules/<area>/` — `schema.ts` (zod), `queries.ts` (Supabase calls), `types.ts`, pure helpers, and colocated `*.test.ts`.
  - `supabase.ts` (browser client + env), `supabase-server.ts` (session client + service-role client).
  - `errors.ts` (`logError` → `error_logs` table), `rateLimit.ts`.
- `src/components/territory-management-system/` — UI; `publisher/`, `dashboard/`, `platform/` subfolders.
- `territory-management-system/migrations/` — numbered SQL migrations (`NNN_description.sql`), applied manually in order in the Supabase SQL editor. Email templates live alongside.
- Path alias: `@/*` → `src/*`.

`next.config.ts` sets `assetPrefix: "/tms-assets"` (multi-zone asset collision fix) and a 6MB
Server Action body limit (map uploads) — don't remove either.

## Roles and access model

- `profiles.role`: `admin` (congregation Administrator), `group_leader` (generates daily
  assignments + monitoring), `super_admin` (platform console, `congregation_id = null`, no RLS grants).
- Guard every server action/page with `requireAdmin()` / `requireGroupLeader()` /
  `requireSuperAdmin()` from `modules/auth/queries.ts`.
- **Publishers are not accounts.** They access via QR → `assignment_batches.access_token` /
  `partnerships.claim_token`. Assignment links are day-scoped to the congregation's timezone
  and become read-only after the day ends.
- `profiles.role` can't be self-assigned (no insert/update grant for `authenticated`).

## Security rules (important)

- **RLS is not enough.** RLS only checks the row's `congregation_id`; it does not verify that
  client-supplied IDs (territory/section/block, record, etc.) belong to the caller's
  congregation. Re-resolve the chain server-side before writing (see `createRecordAction` in
  `actions/records.ts`).
- **Service-role client (`createAdminSupabase`) bypasses RLS.** Every query using it must be
  scoped to a congregation id the caller has proven access to. `serviceRoleUsage.test.ts`
  keeps an allowlist of reviewed files — a new file using the client fails that test on
  purpose. Review the scoping, then add the file to the list.
- Server-only modules import `'server-only'` (stubbed for vitest).
- Validate all form input with zod schemas from `modules/<area>/schema.ts`; re-validate enum
  values like visit results rather than trusting submitted values.
- Rate-limit public/unauthenticated actions with `checkRateLimit` + `clientIp`.
- Territory maps are private (migration 045) — serve via signed URLs, not public URLs.

## Business rules and decisions

These are product decisions confirmed with Russell (the owner). Migration headers and the
comments next to the code record the reasoning. Don't reverse a rule without asking. When a
rule changes, update the code comment, this section, and add a migration if the schema changes.

### Tenancy
- Every tenant table carries its own `congregation_id` (denormalized), so each RLS policy is a
  flat `congregation_id = caller's` check with no joins. This avoids RLS recursion (001).
- There is no public signup. A super admin creates congregations at `/tms/platform` and emails
  the Administrator an invite (046).

### Accounts
- The Administrator owns congregation settings, territories/sections/blocks, and records, and
  reviews pending data. On assignments the Administrator is read-only (004).
- Group Leaders own assignment generation. The Administrator adds them with a generated
  temporary password shown once in the UI, and the first login forces a password change (021).
  This replaced emailed invites, which kept failing.
- Revoking a Group Leader bans the login immediately but keeps the profile row as history.
  A history entry can be deleted permanently only after it is at least 6 months old (006).

### Assignments (Group Leader)
- A batch is one day's assignment: selected territories + a publisher headcount → partnerships
  + one QR code. Links are day-scoped to the congregation's timezone. After that day, the
  pages show "This assignment has ended" and reject writes. Nothing is deleted.
- Several Group Leaders can run batches on the same day, and a leader can run more than one
  (023). No two active batches on the same day may share a territory; application code
  enforces this in `createAssignment`. Each batch belongs to its creator; a batch with
  `created_by = null` (pre-013) can be managed by any Group Leader in the congregation (014).
- Only `approved` records are eligible. The walking order is territory selection order →
  section `sort_order` → block `sort_order` → oldest last visit first (never-visited records
  come first) → `created_at`. Section/block order is primary so routes stay geographically
  coherent; staleness only breaks ties within a block, and it makes records rotate between
  generations.
- The engine (`assignment/engine.ts`) is pure. Records sharing a non-empty Plus Code form one
  household unit and are never split; `maxPerPartnership` (default 6) counts households, not
  records. Slicing is strictly flat and in order: every partnership gets exactly the max except
  the last. Block-clustering was tried and reverted because it left partnerships under-filled.
  Never shuffle.
- If more partnerships are requested than there are households to fill them, the count is
  capped instead of rejected, and the UI shows the gap ("N publishers should do another form of
  ministry today"). Zero eligible records is valid: an empty territory is a search day.
- **House To House** (normal) partnerships are named "Ministry Partner N". **Overflow /
  Auxiliary** batches (`is_overflow`, zero pre-assigned records) are named "Language Searcher N".
  Use `defaultPartnershipName` for both. Overflow partners choose one section + blocks once
  after claiming (026). Several partners may search the same block (037).
- A Group Leader can add one more partnership later; it fills from the next unassigned
  households. The Group Leader can also *offer* an unassigned record to a specific partner, who
  must accept or decline. At most one pending offer per record (043).

### Publishers (Ministry Partners)
- No accounts. They scan the batch QR, claim a partnership, and the claim token is their
  credential for that day.
- **Pass to Another Partner** moves a record instantly and records "Passed by X" (022).
  **Ask** (Search tab) requests a record held by another partnership; the holder must approve
  (042). Auxiliary partners may never request records from House To House partners; requests
  between two Auxiliary or two House To House partners are allowed. A record nobody holds
  today can be claimed instantly.
- **End Ministry Early** only stamps `ended_early_at`. It does not log visits or complete the
  unfinished records, so the staleness signal stays true. (It used to write synthetic `undone`
  visits; that was reverted.) `finished_at` is the separate "finished normally" signal (018).
  A zero-record partnership can finish only via End Ministry Early.
- A partnership is "all done" when every household group has one completed record or is a
  locked Do Not Call record (`isPartnershipAllDone`).
- Publishers never edit an existing record directly. Corrections (Plus Code, territory,
  section/block, household members, resident name), moves ("Unlocated" → new location), and
  removals are **recommendations** that change nothing until the Administrator applies or
  dismisses them (012, 020, 030–034, 041). A move keeps the resident's name.
- Records a publisher adds land as `pending` for Administrator review. They are not added to
  Assigned Records; the partnership that added them can still edit them (019).
- Notes to the Administrator: one optional end-of-ministry note per partnership (011) plus any
  number of quick notes (040). Group Leaders cannot see either.

### Records and visit results (`records/schema.ts` is the single source)
- CSV imports land as `pending`. Plus Code is the location identifier, and address is optional
  (007).
- Labels differ from stored values: `return_visit` "Visited Again", `potential_bible_study`
  "Potential BS", `progressing` "Progressive BS", `discontinued` "No Positive Response",
  `study_discontinued` "Discontinued BS", `moved` "Unlocated", `other` "Busy" (a note is
  required).
- The Bible Study funnel: Potential BS (can be repeated) → Started Bible Study or No Positive
  Response. After Started/Progressive, the next options are Progressive BS / No Positive
  Response / Discontinued BS / Unlocated. `bible_study` is no longer selectable; it is kept
  only so historical visits still render.
- `moved` is never a plain dropdown pick. Publishers go through Mark as Moved (correct the
  record or recommend removal). `initial_visit` (no visits yet) and `undone` are never
  selectable. `getSelectableResults` filters these for both the UI and server validation.
- Do Not Call: marking it stamps `do_not_call_at` (DB trigger, 027) and locks the record for 6
  months, during which no visit can be logged. After the lock, only Do Not Call / Unlocated /
  Visited Again are offered.
- A second visit on the same calendar day updates that day's visit instead of adding one. The
  Administrator can override the latest visit (marked "Overridden by admin", original author
  kept) or undo it (029).
- Retention: visit history 6 months, record change history (039) 1 year. Both are hard-deleted
  by cleanup that runs on each write; there are no cron jobs.
- Every embed of territories/sections/blocks from `territory_records` needs a `!column` hint
  (e.g. `territory_sections!section_id`). Records have up to four FKs to each of these tables,
  and an unhinted embed silently returns zero rows (033).

## Data privacy

Records contain residents' personal data (Philippine Data Privacy Act). Keep the privacy notice
(`/tms/privacy`) and the note-field reminders against recording sensitive personal information
intact when touching record/note forms.

## Conventions

- Match the surrounding comment style: comments explain *why* (constraints, security reasoning,
  migration references), often at length. Keep that density in security-sensitive code.
- New DB changes: add the next numbered migration file; never edit an applied one. Mention the
  migration number in code comments that depend on it.
- Put pure logic in `modules/` with unit tests (e.g. `assignment/engine.ts` + `engine.test.ts`).
- Use `logError(congregationId, source, err)` for unexpected failures; it never throws.
- Toasts via `sonner`; icons via `lucide-react`; confirmations via `useConfirm` / `usePrompt`.
- Offline publisher mode uses IndexedDB (`idb`) in `modules/offline/`.
- Server Actions follow one shape: `(_prev: ActionResult, formData: FormData)`, zod
  `safeParse` first (return the first issue's message), then the `require*()` guard, then the
  module's `queries.ts` call in try/catch returning `{ error }`, then `revalidatePath`. To stay
  on the page after success, return a sentinel such as `{ error: 'SAVED' }`; client forms
  handle it with `useServerAction(action, ['SAVED'])`.
- Keep Supabase calls in `modules/<area>/queries.ts` (client passed in), not in pages or
  components.
- Avoid sequential Supabase round trips: use PostgREST embeds and `Promise.all`. Each extra
  round trip is noticeable on authenticated page loads.
- New `security definer` functions: pin `search_path` and revoke/grant `execute` explicitly
  (see 045). Migrations are applied by hand, so say in the PR when one needs to be run.

## Before pushing

Run `npm test` and `npm run build` (or `npx tsc --noEmit` for a quick typecheck). If you
change setup, roles or provisioning, update `territory-management-system/SETUP.md` too.
