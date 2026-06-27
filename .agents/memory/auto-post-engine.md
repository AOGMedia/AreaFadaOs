---
name: Auto-Post Engine
description: Durable decisions and non-obvious constraints for the Auto-Post Engine module.
---

# Auto-Post Engine

## DB package TypeScript project references
After adding new schema files to `lib/db`, you MUST run `pnpm exec tsc -p tsconfig.json` inside `lib/db` to regenerate `.d.ts` declarations before the API server typecheck will see the new exports. No `build` script exists — use tsc directly.

**Why:** TypeScript project references resolve types from compiled `dist/` declarations, not source `.ts` files, even though the package exports `./src/index.ts`.

**How to apply:** Any time you add exports to `lib/db/src/schema/*.ts`, compile lib/db before typechecking dependent packages.

## draftId is NOT NULL in publish_jobs
`publish_jobs.draft_id` is `.notNull()`. When group-publishing without a draft, auto-create a minimal draft from the caption rather than passing draftId=0.

**Why:** Passing 0 creates orphaned rows and violates implicit FK semantics even without a DB-level FK constraint.

## Posting-time historical query direction
Use `gte(publishJobsTable.publishedAt, since)` (not lte) to select jobs from the last N days.

**Why:** `lte(col, since)` selects jobs OLDER than the window — opposite of intent.

## Image resize in Auto-Post
Current implementation is CSS crop-preview only (client-side `object-fit: cover` per aspect ratio). No server-side resize pipeline exists — real platform push is stubbed. The UI explicitly labels this as "preview only."

**Why:** No object storage is connected. When real platform accounts are wired, actual resize should happen at publish time via the platform's media API.
