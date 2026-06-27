---
name: DB Schema
description: PostgreSQL schema for areafadaos — tables, tier enum, defaults
---

# Database Schema

## Tables
- `users`: id, clerk_id (unique), email, display_name, avatar_url, tier (text, default 'creator'), bio, country, created_at, updated_at
- `activity_log`: id, user_id (FK→users.id CASCADE), type, description, metadata (text/JSON string), created_at
- `posts`: userId FK, campaignId FK (nullable), caption, platforms (jsonb), status (draft/scheduled/published/failed), scheduledAt, tone, hashtags (jsonb), mediaUrls (jsonb), platformVariants (jsonb), engagementScore, isRecycled, originalPostId, version
- `campaigns`: userId FK, name, description, color (hex), startDate, endDate
- `platform_accounts`: userId FK, platform (typed enum), handle, displayName, connected (bool), followerCount — seeded on first GET /platform-accounts
- `hashtag_cache`: platform, hashtag, region (NG/GH/KE), trendScore, category — seeded on first GET /posts/hashtags

## Drizzle typed column gotcha
Typed columns (platform enum, status enum) require explicit casts when comparing against query string params — use `as "draft" | "scheduled" | ...` NOT `as string`. Seed arrays use `typeof table.$inferInsert[]` to satisfy the union.

## Orval codegen quirk
Orval regenerates `api-zod/src/index.ts` with a `./generated/types` re-export every run, causing TS2308 duplicate export errors. Fix is in the codegen script in `lib/api-spec/package.json` — it patches index.ts after orval runs. Do not revert this patch.

## Tiers
Enum values (stored as text): `free | creator | brand | agency | enterprise`
New sign-ups default to `creator` tier (JIT provisioning in `getOrCreateUser`).

## Tier access matrix
| Module | free | creator | brand | agency | enterprise |
|---|---|---|---|---|---|
| scheduling | ✓ | ✓ | ✓ | ✓ | ✓ |
| monetization | | ✓ | ✓ | ✓ | ✓ |
| bookPromo | | ✓ | ✓ | ✓ | ✓ |
| autoPost | | ✓ | ✓ | ✓ | ✓ |
| analytics | | ✓ | ✓ | ✓ | ✓ |
| liveVideo/clipEngine | | | ✓ | ✓ | ✓ |
| trafficTools | | | ✓ | ✓ | ✓ |
| ambassadorCrm/fanHub | | | | ✓ | ✓ |
| campaignIntelligence | | | | | ✓ |

**Why:** Tier gating is enforced server-side in `/users/me/tier` endpoint — frontend just reads the `moduleAccess` map.
