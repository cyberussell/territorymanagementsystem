# CLAUDE.md

Territory Management System (TMS): a multi-congregation SaaS for organizing, assigning and
tracking field-ministry territory work. Next.js 16 (App Router) + React 19, Supabase
(Postgres + Auth + Storage), Tailwind 4, Zod 4, Vitest. Deployed on its own Vercel project and
proxied from `https://www.cyberussell.com/tms` (multi-zone rewrite in the cyberussell.com repo).

## Commands

```bash
npm run dev      # http://localhost:3000/tms/login
npm run build    # production build; also the typecheck (no separate lint/tsc script)
npm test         # vitest run
npx tsc --noEmit # quick typecheck without a full build
```

Env vars go in `.env.local` (git-ignored; Vitest loads it too):
`NEXT_PUBLIC_TMS_SUPABASE_URL`, `NEXT_PUBLIC_TMS_SUPABASE_ANON_KEY`,
`TMS_SUPABASE_SERVICE_ROLE_KEY` (server-only, never `NEXT_PUBLIC_`).

## Layout

- `src/app/tms/` — all routes. Everything lives under `/tms` so the proxy's
  `/tms/:path+` rewrite maps 1:1. Don't add routes outside it.
  - `actions/` — Server Actions, one file per area (`territories.ts`, `records.ts`, `publisher.ts`, `platform.ts`, ...)
  - `dashboard/` (admin), `group-leader/dashboard/`, `platform/` (super admin),
    `assignment/[batchToken]/...` (public publisher pages), `login`, `set-password`, `privacy`, ...
- `src/lib/territory-management-system/` — core logic
  - `modules/<area>/` — `queries.ts` (DB access), `schema.ts` (Zod), `types.ts`, plus unit tests
  - `supabase.ts` (browser client + env), `supabase-server.ts` (server + service-role clients)
  - `modules/offline/` — IndexedDB (`idb`) offline cache/queue for the publisher workspace
- `src/components/territory-management-system/` — UI (`dashboard/`, `publisher/`, `platform/` subfolders)
- `territory-management-system/` — `SETUP.md`, SQL `migrations/`, Supabase email templates

Import via the `@/` alias (`@/lib/territory-management-system/...`).

## Roles and auth

- `super_admin` — platform console at `/tms/platform`; no congregation. Use `requireSuperAdmin()`.
- `admin` — congregation setup, territories, records review. Use `requireAdmin()`.
- `group_leader` — generates the day's assignments (partnerships + QR). Use `requireGroupLeader()`.
- **Publishers have no account.** Access is by opaque tokens in the URL
  (`assignment_batches.access_token`, `partnerships.claim_token`). Assignment links are
  day-scoped in the congregation's timezone (`modules/assignment/date.ts`); past-day links are
  read-only ("This assignment has ended").

The `require*()` helpers in `modules/auth/queries.ts` redirect on failure and return
`{ supabase, userId, userName, congregation }`. Every admin/group-leader page and action starts
with one.

## Multi-tenant rules (important)

- Normal code uses `createServerSupabase()` — RLS enforces congregation isolation.
- `createAdminSupabase()` (service role) **bypasses RLS**. Only use it when necessary, and
  scope every query by a congregation id the caller has proven access to (for publishers:
  the congregation resolved from their batch/partnership token).
- `serviceRoleUsage.test.ts` keeps a list of files allowed to use the service-role client.
  A new file using it fails the test on purpose: review its scoping, then add it to the list.
- Territory map images live in a private bucket; serve them via signed URLs
  (`withSignedTerritoryMapUrls`), never public URLs.
- Modules importing server clients start with `import 'server-only'`.

## Conventions

- **Server Actions**: signature `(_prev: ActionResult, formData: FormData) => Promise<ActionResult>`.
  Parse with the module's Zod schema first (`safeParse`, return the first issue's message),
  then `require*()`, then call `modules/<area>/queries.ts` inside try/catch returning
  `{ error }`, then `revalidatePath`. Success-but-stay-on-page returns a sentinel like
  `{ error: 'SAVED' }`, which client forms handle via `useServerAction(action, ['SAVED'])`.
- Keep DB access in `queries.ts`, not in pages/components. Pass the Supabase client in.
- Unexpected failures: `logError(congregationId, source, err)` (`errors.ts`) writes to `error_logs`.
- Rate-limit sensitive public/auth actions with `rateLimit.ts`.
- Performance matters (DB is in Tokyo, functions pinned to `hnd1` in `vercel.json`): avoid
  sequential round trips — use PostgREST embeds and `Promise.all`.
- UI: Tailwind, `lucide-react` icons, `sonner` toasts, `useConfirm`/`usePrompt` hooks instead of
  `window.confirm/prompt`. Maps use Leaflet/react-leaflet.
- Privacy: the app is subject to the Philippine Data Privacy Act (see `/tms/privacy`). Keep the
  inline "don't record sensitive personal info" reminder on any new resident-notes field.
- Comments explain *why* (constraints, past bugs, security reasoning) — match that style.

## Database migrations

- Add a new numbered file in `territory-management-system/migrations/` (next after the highest,
  e.g. `047_<description>.sql`). Never edit an already-applied migration.
- Migrations are run manually in the Supabase SQL Editor, in order. Mention in the PR that one
  needs to be applied.
- New tables need RLS policies scoped to the user's congregation. New `security definer`
  functions: pin `search_path` and revoke/grant execute explicitly (see `045_...sql`).

## Before pushing

Run `npm test` and `npm run build` (or at least `npx tsc --noEmit`). If you change setup,
roles or provisioning, update `territory-management-system/SETUP.md` too.
