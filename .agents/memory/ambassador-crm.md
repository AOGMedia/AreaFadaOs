---
name: Ambassador CRM
description: Task #5 implementation notes — schema, routes, seed pattern, frontend structure for the 36-state ambassador network.
---

# Ambassador CRM

## Tables
ambassadors, ambassador_points, gamification_configs, reward_tiers, ambassador_tasks, task_completions, micro_influencers, whatsapp_broadcasts — all in `lib/db/src/schema/ambassadors.ts`.

## Seed pattern
All 6 seeder calls live inside `seedAmbassadorData(userId)` in `routes/ambassadors.ts`. Each endpoint guards: `if (rows.length === 0 && process.env.NODE_ENV !== "production") await seedAmbassadorData(user.id)`. This means seed fires on first GET per data type.

**Why:** Keeps seed logic co-located with the routes that need it; avoids a separate seed script; safe in prod.

## Tier guard
All ambassador routes use `requireTier("agency")`. moduleKey in TierGuard is `"ambassadorCrm"`.

## Points + tier logic
Points auto-upgrade tier in both `POST /ambassadors/:id/points` and `POST /ambassador-tasks/:id/complete`. Thresholds: member=0, bronze=800, silver=2000, gold=4000.

## Frontend tabs
State Map → Leaderboard → Tasks → Micro-Influencers → WhatsApp → Gamification.
All use direct `apiFetch` (same pattern as analytics.tsx). No orval-generated hooks needed.

## Known gap (Task #25)
`/ambassadors/widget` embed URL in the leaderboard tab points to a non-existent route — tracked as follow-up.
