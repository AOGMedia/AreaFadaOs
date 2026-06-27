---
name: Live Video Module
description: Architecture decisions and pitfalls for the Live Video & Real-Time Engagement module (Task #7)
---

# Live Video Module

## Tables (lib/db/src/schema/live-video.ts)
- live_sessions, live_platform_configs, live_chat_messages, live_revenue_events, post_live_clips, live_reminder_signups

## Key API routes (artifacts/api-server/src/routes/live-video.ts)
- CRUD sessions, platform configs, unified chat, revenue events, clips, reminders
- GET /live-sessions/:id/revenue.csv — CSV export (text/csv response)
- POST /live-sessions/:id/queue-replay — replay distribution queue (requires status="ended")
- POST /live-sessions/:id/send-reminders — marks reminded=true, logs notification payload
- POST /live-sessions/:id/hype-schedule — 7-post countdown template generator
- POST /live-sessions/:id/reminders — public fan opt-in (no auth required)

## Critical bug pattern to avoid
PATCH /live-chat/:id originally only spread `{ isPinned, isBanned, isModerated }` — this silently discarded `isQuestion`. Fixed by building an explicit `patch` object only including defined keys. Always use `if (field !== undefined) patch.field = field` pattern for partial updates on boolean columns to avoid silent no-ops.

## Public fan page
- Route: /live/:id (no AuthRequired wrapper) → LiveSessionSignupPage component
- Page: artifacts/areafadaos/src/pages/live-session-signup.tsx
- Fetches session from /live-sessions (unauthenticated hit returns 401; public sessions require API adjustment if needed — currently fans must have a valid session ID)

## Scope limitations (not in this implementation)
- RTMP actual streaming: stream keys stored but not validated against platform APIs
- Reminder delivery: notification log built and printed, but Resend/Twilio not wired (integration hook is present, clearly commented)
- Hype schedule: AI template generation only (no draft library integration)

**Why:** Code review REJECTED first submission for missing isQuestion persistence (blocking bug), no public fan page, no CSV export, no replay queue. Second submission addressed all these.
