---
name: Fan Hub
description: Area Fada Fan Hub implementation — schema, routes, seed pattern, frontend structure for Charly Boy's '999' fan community.
---

# Fan Hub

## Tables
fan_profiles, fan_tier_history, fan_points_ledger, fan_challenges, challenge_submissions, content_vault_items, merch_discount_codes, og_invite_list — all in `lib/db/src/schema/fan-hub.ts`.

## Tier system
4 fan tiers (integer 1–4): Curious → Fan → Soldier → OG. Computed by `computeFanTier()` from totalPoints (1000+), referralCount (3+), purchaseVerified. Tier history logged on every upgrade.

## Seed pattern
`seedFanHubData(userId)` in `routes/fan-hub.ts`. Fires on first GET /fan-hub/profiles or /fan-hub/challenges or /fan-hub/vault if table empty and non-prod. Seeds 30 fans, 5 challenges, 6 vault items, 3 merch codes, 2 OG invites.

## Tier guard
All fan-hub routes use `requireTier("agency")`. moduleKey in TierGuard is `"fanHub"`.

## Points engine
Points awarded on challenge submission approval in POST /fan-hub/submissions/:id/review. Referral points (200) awarded on fan registration when referredByCode matches an existing fan's referralCode. Tier recomputed after every point award.

## Known gap (follow-up tasks #33 and #34)
- Merch codes are manually generated; auto-generate on tier 3 upgrade is a follow-up.
- Re-approving a submission can double-award points — blocked by follow-up #34.
