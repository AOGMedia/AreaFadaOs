---
name: OAuth Platform Publishing
description: How OAuth connect flow and real publishing are wired in AreaFada OS; key pitfalls encountered.
---

# OAuth Platform Publishing

## Rule
`platformAccountsTable` has a unique index on `(userId, platform)` — always use select-then-upsert (not onConflictDoUpdate) for the OAuth state row unless drizzle is pointed at that exact index definition.

**Why:** The unique index was added after the table was already live; drizzle's onConflictDoUpdate requires the target to match an existing DB constraint.

**How to apply:** In oauth.ts start route, do a SELECT first, then INSERT or UPDATE based on result.

## OAuth state blob format
`"userId:codeVerifier:state"` stored in `platform_accounts.oauth_state`.  
On callback, find the matching row by scanning all rows for the platform and matching `parts[2] === returnedState` — do NOT rely on ordering or a direct WHERE clause since state is embedded in the blob.

## Token storage
Tokens are AES-256-GCM encrypted via `lib/tokenEncryption.ts`. Key source: `TOKEN_ENCRYPTION_KEY` env var (64-char hex). Falls back to sha256 of a default string in dev — must be set in production.

## Enterprise email auto-elevation
`ENTERPRISE_EMAILS` set in `artifacts/api-server/src/routes/users.ts` — emails listed here get `enterprise` tier on creation AND on every `GET /users/me` call if tier isn't already enterprise. Add emails to that set to grant admin access without a DB migration.

## Publish flow
- Immediate publish: `POST /auto-post/drafts/:id/publish` (no scheduledAt) creates jobs then fire-and-forgets `executePublishJob(jobId)` for each.
- Scheduled publish: jobs are created with `scheduledAt` set but no background cron exists yet — needs Task #61.
- `executePublishJob` is in `artifacts/api-server/src/lib/platformPublisher.ts`.

## Env vars required before OAuth works
`INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`, `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`, `X_CLIENT_ID`, `X_CLIENT_SECRET`, `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `TOKEN_ENCRYPTION_KEY`
