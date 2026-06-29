---
name: OAuth Platform Publishing
description: Durable rules for OAuth connect flow and platform publishing in AreaFada OS.
---

# OAuth Platform Publishing

## Instagram must use Facebook Login, not Basic Display API

**Rule:** Instagram Graph API publishing requires a Facebook App with "Instagram Graph API" enabled as a product. OAuth must go through `https://www.facebook.com/v18.0/dialog/oauth` (Facebook Login dialog), NOT `api.instagram.com`. Token exchange uses `graph.facebook.com/v18.0/oauth/access_token`. All media container and publish calls use `graph.facebook.com/v18.0/{ig-business-id}/media` and `/media_publish`.

**Why:** Basic Display API (`api.instagram.com`) is read-only and cannot post content. Using it for publishing is a silent integration failure — the auth flow looks similar but publishing will always fail.

**How to apply:** Whenever Instagram OAuth or publishing is touched, verify the auth URL domain is `facebook.com`, the token exchange host is `graph.facebook.com`, and the platformUserId stored is the Instagram Business Account ID (from `me?fields=instagram_business_account`), not the Facebook user ID.

## platform_accounts unique constraint

**Rule:** There is a unique index on `(user_id, platform)` in `platform_accounts`. Always select-then-upsert rather than relying on `onConflictDoUpdate` unless Drizzle is explicitly pointed at that named index.

**Why:** The index was added post-launch. Drizzle's onConflictDoUpdate target must match the exact DB constraint by name — without it, the conflict goes unhandled.

## Token encryption key is production-critical

**Rule:** `TOKEN_ENCRYPTION_KEY` must be a 64-char hex string set as an env var before any OAuth account is connected in production. The app throws at token encrypt/decrypt time if missing in production — so connecting any account will hard-fail until it is set.

**How to apply:** Add to deployment checklist. Generate with `openssl rand -hex 32`.

## Enterprise email elevation

**Rule:** `ENTERPRISE_EMAILS` set in `routes/users.ts` auto-upgrades matching emails to `enterprise` tier on every `GET /users/me` call, in addition to at account creation. Add emails to that set to grant admin access without a DB migration.

## OAuth state blob format

State is stored as `"userId:codeVerifier:state"` in `platform_accounts.oauth_state`. On callback, find the matching row by scanning all rows for the platform and matching `blob.split(":")[2] === returnedState` — do not rely on row ordering.
