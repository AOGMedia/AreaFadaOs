---
name: Live Video Module
description: Architecture decisions and pitfalls for the Live Video & Real-Time Engagement module
---

# Live Video Module

## Tables (lib/db/src/schema/live-video.ts)
- live_sessions, live_platform_configs, live_chat_messages, live_revenue_events, post_live_clips, live_reminder_signups

## Key API routes (artifacts/api-server/src/routes/live-video.ts)
- CRUD sessions (requireTier "brand"), platform configs, unified chat, revenue events, clips, reminders
- GET /live-sessions/:id/public — **no auth** — safe public fields for fan sign-up page
- GET /live-sessions/:id/revenue.csv — CSV export (text/csv, browser download)
- POST /live-sessions/:id/queue-replay — replay distribution (requires status="ended")
- POST /live-sessions/:id/send-reminders — marks reminded=true, builds notification log (email/WhatsApp bodies, ready for Resend/Twilio integration)
- POST /live-sessions/:id/hype-schedule — 7-post countdown template generator
- POST /live-sessions/:id/reminders — public fan opt-in (no auth required)

## Public fan page rule
The fan reminder page at `/live/:id` must call the **public** endpoint `/live-sessions/:id/public`, not the authenticated `/live-sessions` list. Any page that must work unauthenticated must call a route that has no `requireAuth` / `requireTier` middleware. The authenticated list route will always return 401 to fans.

## PATCH partial-update pattern
`PATCH /live-chat/:id` uses an explicit `patch` object that only includes keys where the value is not undefined. This avoids silently overwriting boolean columns (e.g. `isQuestion`) that the caller did not intend to change. Always use: `if (field !== undefined) patch.field = field` rather than spreading `req.body` directly into `.set({...})`.

**Why:** Spreading `req.body` naively into Drizzle `.set()` caused `isQuestion` to never persist — callers that sent `{ isPinned: true }` would accidentally reset other boolean fields to `undefined` (which Drizzle ignores) but the intent was unclear and broke moderation workflows.

## Scope limitations (intentional deferral)
- RTMP actual streaming: stream keys stored but not validated against platform APIs
- Reminder delivery: notification log built and logged to console, but Resend/Twilio not wired (integration hook present, clearly commented)
- Hype schedule: AI template generation only (no draft library integration)
