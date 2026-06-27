---
name: Fan Hub
description: Area Fada Fan Hub — durable decisions for the fan community module (tier system, seed pattern, tier guard, points engine).
---

# Fan Hub

**Why:** Charly Boy '999' book launch fan community with tiered loyalty and monetization.

## Tier system
4 fan tiers (integer 1–4): Curious → Fan → Soldier → OG. Computed by `computeFanTier()` from totalPoints (1000+), referralCount (3+), purchaseVerified. Tier history logged on every upgrade.

**Why:** Tier thresholds were set by product requirement; future changes require updating `computeFanTier()` in `routes/fan-hub.ts` and re-seeding if needed.

## Seed pattern
Auto-seeds 30 fans, 5 challenges, 6 vault items, 3 merch codes, 2 OG invites on first API call when table is empty and `NODE_ENV !== "production"`.

**How to apply:** Do not add seed guards per-route — the empty-table check in `seedFanHubData()` is the single gate.

## Tier guard
All fan-hub routes use `requireTier("agency")`. Frontend TierGuard uses `moduleKey="fanHub"`.

## Points engine
Points awarded on challenge submission approval. Referral points (200) on registration when referredByCode matches. Tier recomputed after every award.

**Known risk:** Re-approving a submission can double-award points — guard against this before enabling auto-approval flows.

## Merch codes
Manually generated via POST /fan-hub/merch-codes. Auto-generation on tier-3 upgrade is deferred.
