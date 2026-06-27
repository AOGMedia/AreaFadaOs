---
name: Auto-Post Engine
description: DB schema layout, TypeScript project reference build requirement, and API patterns for the Auto-Post Engine (Task #9).
---

# Auto-Post Engine

## DB package TypeScript project references
The `lib/db` package uses `composite: true` + `emitDeclarationOnly`. After adding new schema files, you MUST run `cd lib/db && pnpm exec tsc -p tsconfig.json` to regenerate `.d.ts` declarations before the API server typecheck will see the new exports. The DB package has no `build` script — use tsc directly.

**Why:** TypeScript project references resolve types from the compiled `dist/` declarations, not the source `.ts` files, even though the package exports `./src/index.ts`. The consuming package (api-server) uses `references` in tsconfig which triggers declaration-based resolution.

**How to apply:** Any time you add exports to `lib/db/src/schema/*.ts`, run the tsc compile step before typechecking dependent packages.

## Auto-Post tables
6 tables in `lib/db/src/schema/auto-post.ts`:
- `post_drafts` — source content, platform variants, status (draft/pending_approval/approved/published/rejected)
- `publish_jobs` — per-platform job with attemptCount/maxAttempts/status
- `account_groups` + `account_group_members` — named multi-account groups
- `approval_requests` — per-draft approval workflow with notificationLog
- `compliance_flags` — AI compliance scan results

## Tier + moduleKey
All auto-post routes use `requireTier("brand")`. Module key is `"autoPost"` — already registered in `artifacts/api-server/src/routes/users.ts` tier matrix before this task.
