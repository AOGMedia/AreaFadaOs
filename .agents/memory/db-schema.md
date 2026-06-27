---
name: DB Schema
description: PostgreSQL schema for areafadaos — tables, tier enum, defaults
---

# Database Schema

## Tables
- `users`: id, clerk_id (unique), email, display_name, avatar_url, tier (text, default 'free'), bio, country, created_at, updated_at
- `activity_log`: id, user_id (FK→users.id CASCADE), type, description, metadata (text/JSON string), created_at

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
