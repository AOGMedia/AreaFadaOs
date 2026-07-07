# AreaFada OS

All-in-one creator management platform for African artists, influencers, and entertainment brands. Combines social scheduling, monetization, fan engagement, live video, ambassador CRM, and AI-powered campaign intelligence in a single workspace.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port from `PORT` env, default 5000)
- `pnpm --filter @workspace/areafadaos run dev` — run the web dashboard (Vite dev server)
- `pnpm --filter @workspace/areafada-revenue run start` — start the Expo mobile app
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)

**Required secrets (set in Replit Secrets pane):**
- `DATABASE_URL` — PostgreSQL connection string (auto-managed by Replit DB)
- `CLERK_SECRET_KEY` — Clerk backend secret
- `CLERK_PUBLISHABLE_KEY` / `VITE_CLERK_PUBLISHABLE_KEY` — Clerk frontend key
- `CLERK_WEBHOOK_SECRET` — Clerk webhook signing secret
- `TOKEN_ENCRYPTION_KEY` — 32-byte hex key for OAuth token encryption at rest
- `SESSION_SECRET` — random string for session signing
- `RESEND_API_KEY` — Resend transactional email (without this, `/clip-schedules/export-email` returns 503 in production)
- `FLUTTERWAVE_SECRET_KEY` / `FLUTTERWAVE_SECRET_HASH` — Flutterwave payments
- `PAYSTACK_SECRET_KEY` — Paystack payments
- `ANTHROPIC_API_KEY` — AI features (campaign intelligence, clip engine)

**Shared env vars (set in Replit Env Vars):**
- `RESEND_FROM_EMAIL` — sender address (must be a verified Resend domain)
- `ENTERPRISE_EMAILS` — comma-separated emails with Enterprise tier access

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Auth: Clerk (managed via Replit Auth pane — instance `app_3FiDiM426PyZHTYJk629JG6Ji7p`)
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec in `lib/api-spec/`)
- Web: React 19, Vite 7, Tailwind CSS v4, Wouter (routing)
- Mobile: Expo (React Native), DM Sans font, brand green tokens
- Email: Resend
- Payments: Flutterwave, Paystack
- AI: Anthropic Claude
- Build: esbuild (ESM bundle → `dist/index.mjs` for API server)

## Where Things Live

```
artifacts/api-server/src/
  app.ts                    # Express app factory + middleware
  index.ts                  # Entry point, server start
  routes/                   # One file per feature domain
  lib/                      # Server utilities (logger, tokenEncryption, platformPublisher, etc.)

artifacts/areafadaos/src/
  App.tsx                   # Router root
  pages/                    # One file per page/route
  components/               # Shared UI components
  hooks/                    # React Query hooks (generated + custom)

artifacts/areafada-revenue/ # Expo mobile app (Clerk auth, 4 tabs: Home, Deals, Invoices, Affiliates)

lib/db/src/
  schema.ts                 # Drizzle schema — source of truth for DB shape
  seed.ts                   # Auto-fires when ambassador tables are empty (non-prod)

lib/api-spec/               # OpenAPI spec — source of truth for all API contracts
lib/api-client-react/       # Orval-generated React Query hooks
lib/api-zod/                # Orval-generated Zod schemas
```

## Architecture Decisions

- **OpenAPI-first codegen**: `lib/api-spec/` defines all routes; Orval generates both React Query hooks (`lib/api-client-react/`) and Zod schemas (`lib/api-zod/`). Always run `pnpm --filter @workspace/api-spec run codegen` after changing any route shape — don't hand-edit the generated files.
- **Drizzle `sql<type>`casting**: Numeric/timestamp columns returned from `drizzle-orm` raw queries must be cast with `sql<type>` helpers to avoid string-typed values at runtime. This is a known Drizzle quirk — see `db-schema.md` in agent memory.
- **OAuth token encryption**: Platform OAuth tokens (Instagram, TikTok, YouTube, etc.) are AES-encrypted before storage using `TOKEN_ENCRYPTION_KEY`. Losing this key makes all stored tokens unrecoverable.
- **Tier gating**: `requireTier("agency")` middleware guards Ambassador CRM and campaign intelligence routes. Tiers are: `free`, `creator`, `pro`, `agency`, `enterprise`.
- **Ambassador seed**: Seed data auto-fires when ambassador tables are empty in non-production environments, so the CRM always has demo data in dev.
- **esbuild ESM bundle**: The API server builds to a single `dist/index.mjs` for deployment (start with `node --enable-source-maps ./dist/index.mjs`); the dev server uses `tsx` for direct TS execution without a build step.

## Product

**AreaFada OS** serves creators and their teams across eight feature domains:

1. **Social Scheduling** — draft, schedule, and auto-publish to Instagram, TikTok, X, YouTube, Facebook
2. **Monetization Hub** — invoicing, affiliate links, Flutterwave/Paystack payment collection, revenue analytics
3. **Fan Hub** — tiered loyalty (Tier 1–3), challenges, points, fan portal, auto-generated merch codes at Tier 3
4. **Ambassador CRM** — manage brand ambassadors, track KPIs, issue payouts (agency tier only)
5. **Live Video** — OBS WebSocket streaming, live session management, fan ticket sales, reminder sign-ups
6. **Clip Engine** — AI video clip extraction, captions, watermarks, multi-account distribution (with FFmpeg)
7. **Campaign Intelligence** — AI brief generation, campaign analytics, WhatsApp approval notifications
8. **Media Partners** — book promo deals and traffic exchange with partner media houses

**AreaFada Revenue** (mobile) — Expo app for on-the-go deal management, invoices, and affiliate tracking.

## User Preferences

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

## CI / GitHub Actions

The `build-web` job in `.github/workflows/ci.yml` runs a Vite production build as a smoke-check. It uses `VITE_CLERK_PUBLISHABLE_KEY` with a built-in fallback (`pk_test_placeholder`) so the build succeeds even when the secret is not configured in repository settings. This means forks and open PRs can build without needing a real Clerk key.

**Secrets that must be set in GitHub → Settings → Secrets and Variables → Actions for a fully functional CI:**
- `VITE_CLERK_PUBLISHABLE_KEY` — real Clerk publishable key (optional; falls back to placeholder for build-only checks)

## Gotchas

- **Always run codegen after API changes**: Any change to `lib/api-spec/` must be followed by `pnpm --filter @workspace/api-spec run codegen` or the frontend will be out of sync with the backend.
- **DB push is dev-only**: `pnpm --filter @workspace/db run push` is destructive in production — use `generate` + `migrate` for production schema changes.
- **`orval` index.ts patch**: The generated `lib/api-client-react/src/index.ts` exports need a manual patch after codegen — see `db-schema.md` in agent memory for details.
- **OBS WebSocket**: Live video features require OBS running locally with WebSocket server enabled. `OBS_WEBSOCKET_URL`, `OBS_WEBSOCKET_PASSWORD`, and `OBS_WEBSOCKET_ALLOWED_HOSTS` must all be set.
- **Flutterwave webhook hash**: `FLUTTERWAVE_SECRET_HASH` must exactly match the hash configured in the Flutterwave dashboard for webhook verification to pass.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- GitHub repo: https://github.com/AOGMedia/AreaFadaOs
