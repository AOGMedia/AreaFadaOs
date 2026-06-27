---
name: AreaFada OS Stack
description: Full-stack foundation details for the areafadaos platform
---

# AreaFada OS Stack

## Architecture
- **Frontend**: React + Vite at `artifacts/areafadaos`, previewPath `/`, port from `$PORT` env var (22997 in dev)
- **Backend**: Express 5 at `artifacts/api-server`, port 8080
- **Database**: PostgreSQL + Drizzle ORM at `lib/db`
- **Auth**: Clerk (Replit-managed), provisioned via `setupClerkWhitelabelAuth()`
- **API client**: Orval-generated hooks at `lib/api-client-react` from `lib/api-spec/openapi.yaml`
- **Workspace**: pnpm monorepo

## Key conventions
- All API calls use Orval-generated hooks from `@workspace/api-client-react`
- Clerk auth is cookie-based on web — no bearer tokens in browser
- `requireAuth` middleware extracts `auth.userId` from Clerk session via `getAuth(req)`
- Users are JIT-provisioned in DB on first API call (`getOrCreateUser`)
- Theme: emerald green primary (#2dd172 / hsl 152 80% 36-42%), dark card backgrounds in dark mode
- Font: DM Sans (Google Fonts)

**Why:** This is a monorepo — all packages must be installed with `--filter @workspace/<name>`.
