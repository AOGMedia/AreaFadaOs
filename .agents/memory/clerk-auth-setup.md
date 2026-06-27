---
name: Clerk Auth Setup
description: Clerk provisioning status and canonical wiring for areafadaos
---

# Clerk Auth Setup

## Status
Clerk provisioned via `setupClerkWhitelabelAuth()` — status changed from `not_configured` to `managed`.
App ID: `app_3FiDiM426PyZHTYJk629JG6Ji7p`

## Critical wiring rules (must follow verbatim)
- `publishableKeyFromHost` from `@clerk/react/internal` — NOT the raw env var
- `clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL` — always unconditional, empty in dev is correct
- Routes MUST be `path="/sign-in/*?"` and `path="/sign-up/*?"` (the `/*?` optional wildcard is required)
- `<SignIn path>` uses full window path: `` `${basePath}/sign-in` ``
- Server: `clerkProxyMiddleware()` mounted BEFORE body parsers
- `vite.config.ts` must have `tailwindcss({ optimize: false })` when using `@clerk/themes/*.css`
- CSS layers: `@layer theme, base, clerk, components, utilities;` before `@import "tailwindcss"`

**Why:** Getting any of these wrong causes 404s, broken OAuth callbacks, or Clerk UI broken in prod.
