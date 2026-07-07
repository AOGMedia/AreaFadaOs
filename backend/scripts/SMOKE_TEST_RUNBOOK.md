# Clip Schedule Email — Smoke Test Runbook

## Prerequisites

| Env var / Secret | Where to set | Value |
|---|---|---|
| `RESEND_API_KEY` | Replit Secrets | Your Resend API key |
| `RESEND_FROM_EMAIL` | Replit Env (shared) | `AreaFada OS <no-reply@areafada.com>` — already set correctly; do **not** use the Resend sandbox address |

## Run the smoke test

### API acceptance check (no real inbox needed)
```bash
pnpm --filter api-server smoke:email
```
Sends to Resend's test address (`delivered@resend.dev`). Confirms:
- `RESEND_API_KEY` is valid
- DB query returns the correct schedule data for the first user
- `buildClipScheduleEmailPayload()` generates valid HTML + CSV
- Resend API accepts the payload and returns a `messageId`

### Real inbox check (HTML + CSV rendering verification)
```bash
SMOKE_RECIPIENT=you@example.com pnpm --filter api-server smoke:email
```
Send to a real email address and verify in your email client:
- AreaFada OS green header renders correctly
- Schedule table shows clips in the correct order (date, account, label, format)
- Rows alternate in background colour (#ffffff / #f9fafb)
- CSV attachment opens in Excel/Google Sheets with correct columns:
  Date, Time, Account, Platform, Clip Label, Format, Caption, Hashtags, Status

### Target a specific user
```bash
SMOKE_USER_ID=2 SMOKE_RECIPIENT=creator@example.com pnpm --filter api-server smoke:email
```

## Verifying a specific user has demo schedule data
The route triggers `maybeClipSeed()` on first load for any user. If the target user
has no schedules in the next 30 days, the email will contain the empty-state copy
("No clips are currently scheduled…") and a header-only CSV — both of which are
valid and confirmed working.

To trigger seeding for a user, navigate to the Clip Engine tab in AreaFada OS while
logged in; the seed fires automatically on the first API request for that user.

## Email deliverability DNS setup

`RESEND_FROM_EMAIL` is already set to `AreaFada OS <no-reply@areafada.com>`.
The remaining step is verifying `areafada.com` in Resend and adding the required
DNS records (SPF, DKIM, DMARC). Full step-by-step instructions:

```
artifacts/api-server/scripts/DNS-SETUP.md
```

Quick check at any time:

```bash
pnpm --filter api-server check:dns
```

## What the smoke test exercises

The script calls the **identical code path** as the live HTTP route:
- Same Drizzle ORM query (`clipSchedulesTable` ⟶ left join `clipsTable`, `clipAccountsTable`)
- Same `buildClipScheduleEmailPayload()` function (exported from `src/routes/clip-engine.ts`)
- Same Resend `emails.send()` call with HTML body + base64 CSV attachment

The only difference from the live route is that auth middleware is bypassed (the
script queries the DB directly using a user id, rather than resolving one from a
Clerk session token).
