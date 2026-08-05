# Territory Management System

Standalone multi-congregation SaaS for organizing, assigning, and tracking territory work
during field ministry. Deployed independently on its own Vercel project and proxied at
`https://www.cyberussell.com/tms` via a multi-zone rewrite in the
[cyberussell.com](https://github.com/cyberussellofficial-ctrl/cyberussell) repo's
`next.config.ts` (gated on the `TMS_ZONE_URL` env var there).

Routes live under `src/app/tms/` (not the repo root) so the proxy's path rewrite
(`/tms/:path+` → `<this deployment>/tms/:path+`) maps 1:1.

See [territory-management-system/SETUP.md](territory-management-system/SETUP.md) for Supabase
project setup, roles, and manual congregation/admin provisioning.

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in the Supabase project keys, see SETUP.md
npm run dev
```

Then visit `http://localhost:3000/tms/login`.

## Deploying

1. Push this repo to GitHub and import it into a new Vercel project.
2. Set the three `TMS_SUPABASE_*` env vars (see `.env.example`) in that Vercel project's settings.
3. Once deployed, set `TMS_ZONE_URL` in the **cyberussell.com** Vercel project to this
   deployment's URL — that's what turns on the `/tms` proxy on the main site.
