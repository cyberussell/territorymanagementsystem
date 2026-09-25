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

Env vars (in `.env.local`, gitignored; tests load it too via `vitest.setup.ts`):
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
