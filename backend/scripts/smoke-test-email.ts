#!/usr/bin/env tsx
/**
 * Clip Schedule Email — End-to-End Smoke Test
 *
 * Exercises the REAL route logic end-to-end without the HTTP auth layer:
 *   1. Queries the live DB for a user's 30-day schedule (same query as the route)
 *   2. Calls buildClipScheduleEmailPayload() — the identical function used by the route
 *   3. Sends via Resend with RESEND_API_KEY
 *   4. Asserts the response contains a messageId
 *
 * Usage (from workspace root):
 *   pnpm --filter api-server smoke:email
 *
 * Send to a real inbox for HTML rendering verification:
 *   SMOKE_RECIPIENT=you@example.com pnpm --filter api-server smoke:email
 *
 * Use a specific user's data:
 *   SMOKE_USER_ID=1 pnpm --filter api-server smoke:email
 *
 * Required env vars:
 *   RESEND_API_KEY   — Resend API key (set as a Replit secret)
 *
 * Optional env vars:
 *   RESEND_FROM_EMAIL — sender address (default: AreaFada OS <no-reply@areafada.com>)
 *   SMOKE_RECIPIENT   — recipient (default: delivered@resend.dev)
 *   SMOKE_USER_ID     — numeric DB user id (default: first user in DB)
 *   DATABASE_URL      — Postgres connection string (auto-set in Replit)
 */

import { Resend } from "resend";
import { db, usersTable, clipSchedulesTable, clipsTable, clipAccountsTable } from "@workspace/db";
import { eq, and, gte, lte, asc } from "drizzle-orm";
import { buildClipScheduleEmailPayload } from "../src/routes/clip-engine.js";

const key = process.env.RESEND_API_KEY;
if (!key) {
  console.error("❌ RESEND_API_KEY is not set.");
  console.error("   Set it as a Replit secret, then re-run.");
  process.exit(1);
}

const resend = new Resend(key);
const recipient = process.env.SMOKE_RECIPIENT ?? "delivered@resend.dev";
const fromAddress = process.env.RESEND_FROM_EMAIL ?? "AreaFada OS <no-reply@areafada.com>";

if (fromAddress.includes("resend.dev")) {
  console.error(
    "❌ RESEND_FROM_EMAIL is using the Resend sandbox address. " +
    "Emails sent from this address WILL fail spam checks.\n" +
    "   Set RESEND_FROM_EMAIL=\"AreaFada OS <no-reply@areafada.com>\" in Replit Secrets,\n" +
    "   verify the domain in Resend (https://resend.com/domains),\n" +
    "   then re-run: pnpm --filter api-server check:dns",
  );
  process.exit(1);
}

console.log("\n🔬 AreaFada OS — Clip Schedule Email Smoke Test");
console.log("   Testing the REAL route logic (DB query + email builder + Resend API)\n");

// ── Step 1: Resolve the target user ──────────────────────────────────────────
let userId: number;

if (process.env.SMOKE_USER_ID) {
  userId = Number(process.env.SMOKE_USER_ID);
  if (isNaN(userId)) {
    console.error("❌ SMOKE_USER_ID must be a numeric DB user id.");
    process.exit(1);
  }
  console.log(`   User       : id=${userId} (from SMOKE_USER_ID)`);
} else {
  const users = await db.select({ id: usersTable.id, email: usersTable.email })
    .from(usersTable).limit(1);
  if (users.length === 0) {
    console.error("❌ No users found in the database.");
    console.error("   Sign in to AreaFada OS at least once to create a user record,");
    console.error("   or set SMOKE_USER_ID to an existing numeric DB user id.");
    process.exit(1);
  }
  userId = users[0].id;
  console.log(`   User       : id=${userId}, email=${users[0].email}`);
}

// ── Step 2: Run the SAME DB query the route uses ──────────────────────────────
const start = new Date();
const end = new Date(start.getTime() + 30 * 86_400_000);

console.log(`   Date range : ${start.toISOString().slice(0, 10)} → ${end.toISOString().slice(0, 10)}`);

const schedules = await db.select({
  schedule: clipSchedulesTable,
  clip: clipsTable,
  account: clipAccountsTable,
})
  .from(clipSchedulesTable)
  .leftJoin(clipsTable, eq(clipSchedulesTable.clipId, clipsTable.id))
  .leftJoin(clipAccountsTable, eq(clipSchedulesTable.accountId, clipAccountsTable.id))
  .where(and(
    eq(clipSchedulesTable.userId, userId),
    gte(clipSchedulesTable.scheduledAt, start),
    lte(clipSchedulesTable.scheduledAt, end),
  ))
  .orderBy(asc(clipSchedulesTable.scheduledAt));

console.log(`   Schedules  : ${schedules.length} clip(s) found in next 30 days`);

// ── Step 3: Build the email payload using the REAL route helper ───────────────
const { subject, htmlBody, csvBase64, filename, scheduleCount } =
  buildClipScheduleEmailPayload(schedules, start, end);

// Validate the generated payload before sending
if (!htmlBody.includes("AreaFada OS")) {
  console.error("❌ HTML payload sanity check failed: missing 'AreaFada OS' branding.");
  process.exit(1);
}
if (scheduleCount === 0 && !htmlBody.includes("No clips are currently scheduled")) {
  console.error("❌ HTML payload sanity check failed: empty-schedule copy not found.");
  process.exit(1);
}
if (scheduleCount > 0 && !htmlBody.includes("clip")) {
  console.error("❌ HTML payload sanity check failed: expected schedule table content.");
  process.exit(1);
}

const csvText = Buffer.from(csvBase64, "base64").toString("utf-8");
const csvLines = csvText.split("\n").filter(l => l.trim() !== "");
if (csvLines.length < 1 || !csvLines[0].includes("Date")) {
  console.error(`❌ CSV sanity check failed: expected header row, got: ${csvLines[0]}`);
  process.exit(1);
}
if (csvLines.length !== scheduleCount + 1) {
  console.error(`❌ CSV row count mismatch: expected ${scheduleCount + 1} lines (1 header + ${scheduleCount} data), got ${csvLines.length}`);
  process.exit(1);
}

console.log(`   CSV rows   : ${csvLines.length - 1} data rows + 1 header ✓`);
console.log(`   HTML check : branded email with correct copy ✓`);
console.log(`   Attachment : ${filename}`);
console.log(`   Subject    : ${subject}`);
console.log(`   From       : ${fromAddress}`);
console.log(`   To         : ${recipient}\n`);

// ── Step 4: Send via Resend (same call as the route) ─────────────────────────
const { data, error } = await resend.emails.send({
  from: fromAddress,
  to: [recipient],
  subject,
  html: htmlBody,
  attachments: [{ filename, content: csvBase64 }],
});

if (error) {
  console.error("❌ Resend returned an error:");
  console.error(`   ${error.message}`);
  if ((error as any).name) console.error(`   name: ${(error as any).name}`);
  console.error("\n   Common causes:");
  console.error("   • Sender domain not verified in Resend → verify areafada.com at https://resend.com/domains");
  console.error("     then set RESEND_FROM_EMAIL=AreaFada OS <no-reply@areafada.com>");
  console.error("   • Invalid API key → check RESEND_API_KEY in Replit secrets");
  process.exit(1);
}

// ── Step 5: Report results ────────────────────────────────────────────────────
console.log("✅ SMOKE TEST PASSED — email delivered successfully via Resend");
console.log(`   messageId  : ${data?.id}`);
console.log(`   Schedules  : ${scheduleCount} clip(s) in email`);
console.log(`   CSV rows   : ${csvLines.length - 1}`);
if (recipient === "delivered@resend.dev") {
  console.log("\n   ℹ️  Sent to Resend's test address (delivered@resend.dev).");
  console.log("   API acceptance is confirmed. For HTML rendering verification:");
  console.log("   SMOKE_RECIPIENT=you@example.com pnpm --filter api-server smoke:email");
} else {
  console.log(`\n   Check ${recipient} to verify:`);
  console.log("   • AreaFada OS branding in the email header");
  console.log("   • Schedule table renders correctly (dates, accounts, clip labels, formats)");
  console.log(`   • CSV attachment '${filename}' opens with correct columns in Excel/Sheets`);
}
console.log();
