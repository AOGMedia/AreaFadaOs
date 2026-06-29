# [Project name]

_Replace the heading above with the project's name, and this line with one sentence describing what this app does for users._

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Required env: `RESEND_API_KEY` — Resend API key for transactional email (e.g. clip schedule exports). Without this key the `/clip-schedules/export-email` endpoint returns 503 in production. Obtain from resend.com and set as a secret.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

_Populate as you build — short repo map plus pointers to the source-of-truth file for DB schema, API contracts, theme files, etc._

## Architecture decisions

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Clerk Email Branding — Required Auth Pane Configuration

**Current state (verified 2026-06-29):** Clerk instance `app_3FiDiM426PyZHTYJk629JG6Ji7p` (FAPI: `stable-llama-78.clerk.accounts.dev`) has `application_name = "CreatorOS Africa"`. This name appears in all Clerk-generated emails (email verification, magic link, password reset) as the sender/app name.

**Required:** Change to `"AreaFada OS"` so users see consistent AreaFada branding in every auth email. This cannot be done via the Backend API — it must be applied through the Replit Auth pane.

**Steps to apply (one-time, manual):**
1. Open the workspace toolbar → click the **Auth** icon (shield icon).
2. In the Auth pane, find **Application name** (or **App name**) and change it from `"CreatorOS Africa"` to **`"AreaFada OS"`**.
3. Save/apply the change.
4. Trigger a test verification email (sign up with a new account) to confirm the sender name shows "AreaFada OS".

**For branded sending domain** (emails from @areafada.com instead of Clerk's default):
1. Go to **Publishing → Domains → Manage** (for any linked external domain).
2. Copy the CNAME records Replit provides and add them at your DNS provider.
3. Allow up to 48 h for DNS propagation; re-check the Manage panel until all records show verified.

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
