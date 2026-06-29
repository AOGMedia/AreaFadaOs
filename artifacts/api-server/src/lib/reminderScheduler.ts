import { db } from "@workspace/db";
import { invoicesTable, paymentRemindersTable, analyticsSnapshots, weeklyDigests, usersTable, publishJobsTable } from "@workspace/db";
import { eq, and, gte, lte, lt, sql, desc } from "drizzle-orm";
import { Resend } from "resend";
import { logger } from "./logger";
import { runDailyIngestion } from "./platformDataFetcher.js";
import { executePublishJob } from "./platformPublisher.js";

const REMINDER_DAYS = [3, 7, 14];
const INTERVAL_MS = 60 * 60 * 1000; // check every hour

async function markInvoicesOverdue(now: Date): Promise<number> {
  // Transition sent invoices whose due date has passed to overdue
  const result = await db
    .update(invoicesTable)
    .set({ status: "overdue", updatedAt: now })
    .where(
      and(
        eq(invoicesTable.status, "sent"),
        lt(invoicesTable.dueDate, now),
      ),
    )
    .returning({ id: invoicesTable.id });

  if (result.length > 0) {
    logger.info({ count: result.length, ids: result.map(r => r.id) }, "Invoices transitioned to overdue");
  }
  return result.length;
}

async function processOverdueReminders(now: Date): Promise<number> {
  let totalLogged = 0;

  for (const days of REMINDER_DAYS) {
    const windowStart = new Date(now.getTime() - (days + 1) * 86_400_000);
    const windowEnd = new Date(now.getTime() - days * 86_400_000);

    // Find overdue invoices whose due date falls in the [days, days+1) window
    const overdueInvoices = await db
      .select()
      .from(invoicesTable)
      .where(
        and(
          eq(invoicesTable.status, "overdue"),
          gte(invoicesTable.dueDate, windowStart),
          lte(invoicesTable.dueDate, windowEnd),
        ),
      );

    for (const inv of overdueInvoices) {
      // Skip if already reminded in the last 24h for this interval
      const [recent] = await db
        .select({ c: sql<number>`count(*)` })
        .from(paymentRemindersTable)
        .where(
          and(
            eq(paymentRemindersTable.invoiceId, inv.id),
            gte(paymentRemindersTable.sentAt, new Date(now.getTime() - 86_400_000)),
          ),
        );
      if (Number(recent?.c ?? 0) > 0) continue;

      const message = `[AUTO ${days}d] Invoice ${inv.invoiceNumber} is ${days} days overdue. Amount: ${inv.currency} ${Number(inv.total).toLocaleString()}. ${inv.paymentLink ? `Payment link: ${inv.paymentLink}` : "Please arrange payment."}`;

      await db.insert(paymentRemindersTable).values({
        invoiceId: inv.id,
        userId: inv.userId,
        channel: "email",
        status: "sent",
        message,
        sentAt: now,
      });

      totalLogged++;
      logger.info({ invoiceId: inv.id, days, invoiceNumber: inv.invoiceNumber }, "Auto reminder logged");
    }
  }

  return totalLogged;
}

// ─── Weekly digest job ────────────────────────────────────────────────────

/** Normalize a Date to the Monday 00:00:00.000 UTC that starts its ISO week. */
function isoWeekStart(d: Date): Date {
  const out = new Date(d);
  out.setUTCHours(0, 0, 0, 0);
  // getUTCDay(): 0=Sun,1=Mon,…,6=Sat.  Shift so Monday=0.
  const offset = (out.getUTCDay() + 6) % 7; // days since last Monday
  out.setUTCDate(out.getUTCDate() - offset);
  return out;
}

async function generateWeeklyDigests(): Promise<number> {
  const now = new Date();
  const dayOfWeek = now.getUTCDay(); // 0 = Sunday
  if (dayOfWeek !== 0) return 0; // Only run on Sundays

  // Stable calendar boundaries — identical on every hourly run this Sunday
  const weekStart = isoWeekStart(now);                       // Monday 00:00 UTC
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);              // Sunday 00:00 UTC
  weekEnd.setUTCHours(23, 59, 59, 999);

  // Look back at the full week for snapshot data
  const snapWindowStart = new Date(weekStart);
  snapWindowStart.setUTCDate(snapWindowStart.getUTCDate() - 7);

  // Get all users who have analytics snapshots in this window
  const usersWithSnaps = await db
    .selectDistinct({ userId: analyticsSnapshots.userId })
    .from(analyticsSnapshots)
    .where(gte(analyticsSnapshots.snapshotDate, snapWindowStart));

  let generated = 0;

  for (const { userId } of usersWithSnaps) {
    // Idempotency: exact calendar-week match (weekStart is always Monday 00:00 UTC)
    const [existing] = await db.select({ id: weeklyDigests.id })
      .from(weeklyDigests)
      .where(and(eq(weeklyDigests.userId, userId), eq(weeklyDigests.weekStart, weekStart)))
      .limit(1);
    if (existing) continue;

    // Fetch latest snapshots for the user
    const snaps = await db.select().from(analyticsSnapshots)
      .where(eq(analyticsSnapshots.userId, userId))
      .orderBy(desc(analyticsSnapshots.snapshotDate))
      .limit(70);

    if (snaps.length === 0) continue;

    // Aggregate by platform
    const byPlatform: Record<string, typeof snaps> = {};
    for (const s of snaps) {
      if (!byPlatform[s.platform]) byPlatform[s.platform] = [];
      byPlatform[s.platform].push(s);
    }

    const platforms = Object.entries(byPlatform).map(([platform, data]) => ({
      platform,
      followers: data[0].followers,
      reach: data[0].reach,
      engagementRate: Number(data[0].engagementRate),
      followerGrowth: data[0].followers - (data[data.length - 1]?.followers ?? data[0].followers),
    }));

    const topPlatform = [...platforms].sort((a, b) => b.engagementRate - a.engagementRate)[0];
    const totalReach = platforms.reduce((s, p) => s + p.reach, 0);
    const avgEng = platforms.reduce((s, p) => s + p.engagementRate, 0) / (platforms.length || 1);

    const narrative = `📊 Area Fada OS — Weekly Performance Digest (w/e ${weekEnd.toLocaleDateString("en-GB")})

Best platform this week: ${topPlatform?.platform ?? "Instagram"} with ${topPlatform?.engagementRate.toFixed(1) ?? 0}% engagement.
Total reach: ${(totalReach / 1000).toFixed(0)}K across ${platforms.length} platforms.
Avg engagement: ${avgEng.toFixed(2)}% (${avgEng > 4 ? "above" : "below"} industry average).

Action items: Post 999 content 8-10am WAT weekdays. Engage comments within 1hr.

Keep grinding, Fada 🤘`;

    const userRow = await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    const email = userRow[0]?.email;
    let emailSent = false;

    if (email) {
      if (process.env.RESEND_API_KEY) {
        try {
          const resend = new Resend(process.env.RESEND_API_KEY);
          const { error } = await resend.emails.send({
            from: "AreaFada OS <digest@areafada.com>",
            to: email,
            subject: `Your weekly performance digest — w/e ${weekEnd.toLocaleDateString("en-GB")}`,
            text: narrative,
          });
          if (error) {
            logger.warn({ error, userId, email, weekEnd: weekEnd.toISOString() }, "Resend delivery failed for weekly digest");
          } else {
            emailSent = true;
            logger.info({ userId, email, weekEnd: weekEnd.toISOString() }, "Weekly digest email sent via Resend");
          }
        } catch (err) {
          logger.warn({ err, userId, email }, "Exception sending weekly digest email via Resend");
        }
      } else {
        logger.info({ userId, email, weekEnd: weekEnd.toISOString() }, "[DIGEST EMAIL STUB] set RESEND_API_KEY to enable real delivery");
      }
    }

    await db.insert(weeklyDigests).values({
      userId,
      weekStart,
      weekEnd,
      narrative,
      topPlatform: topPlatform?.platform,
      totalReach,
      totalEngagements: Math.round(totalReach * avgEng / 100),
      avgEngagementRate: String(avgEng.toFixed(2)),
      followersGained: topPlatform?.followerGrowth ?? 0,
      emailSent,
      whatsappLogged: true,
    });

    logger.info({ userId, weekEnd: weekEnd.toISOString() }, "Weekly digest generated");
    generated++;
  }

  return generated;
}

async function runCycle() {
  try {
    const now = new Date();
    const transitioned = await markInvoicesOverdue(now);
    const reminded = await processOverdueReminders(now);
    if (transitioned > 0 || reminded > 0) {
      logger.info({ transitioned, reminded }, "Reminder scheduler cycle complete");
    }
  } catch (err) {
    logger.error({ err }, "Reminder scheduler error");
  }
}

async function runWeeklyCycle() {
  try {
    const generated = await generateWeeklyDigests();
    if (generated > 0) {
      logger.info({ generated }, "Weekly digest scheduler: digests generated");
    }
  } catch (err) {
    logger.error({ err }, "Weekly digest scheduler error");
  }
}

// ─── Daily platform data ingestion ───────────────────────────────────────────

/** Track the last calendar day (UTC) that ingestion ran so we don't re-fire
 *  multiple times within the same hour during the same day. */
let lastIngestionDay = -1;

async function runDailyIngestionCycle() {
  const nowDay = new Date().getUTCDate();
  if (nowDay === lastIngestionDay) return; // already ran today
  lastIngestionDay = nowDay;
  await runDailyIngestion();
}

// ─── Publish job scheduler ────────────────────────────────────────────────────

/**
 * How long (ms) a job may sit in `in_progress` before we consider it orphaned
 * (e.g. the server crashed mid-publish).  After this window the job is reset
 * to `pending` so the next scheduler tick can retry it.
 */
const PUBLISH_IN_PROGRESS_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Reset any jobs that have been stuck in `in_progress` for longer than
 * PUBLISH_IN_PROGRESS_TIMEOUT_MS.  This covers server-restart crashes where
 * the in-flight HTTP call never completed and the status was never updated.
 */
export async function recoverOrphanedPublishJobs(now: Date): Promise<void> {
  const orphanCutoff = new Date(now.getTime() - PUBLISH_IN_PROGRESS_TIMEOUT_MS);
  const recovered = await db
    .update(publishJobsTable)
    .set({ status: "pending", updatedAt: now })
    .where(
      and(
        eq(publishJobsTable.status, "in_progress"),
        lte(publishJobsTable.updatedAt, orphanCutoff),
      ),
    )
    .returning({ id: publishJobsTable.id });

  if (recovered.length > 0) {
    logger.warn(
      { count: recovered.length, ids: recovered.map((r) => r.id) },
      "Publish job scheduler: recovered orphaned in_progress jobs",
    );
  }
}

/**
 * Pick up any pending publish_jobs whose scheduledAt has passed and execute
 * them.
 *
 * Jobs are claimed atomically with a single UPDATE … RETURNING before any
 * executePublishJob call is dispatched.  This closes the race window where two
 * consecutive minute ticks could both SELECT the same `pending` row and start
 * duplicate publish attempts before either one had a chance to flip the status
 * to `in_progress`.
 */
export async function runPublishJobScheduler(): Promise<void> {
  try {
    const now = new Date();

    // Recover orphaned jobs first so they become eligible in this very tick.
    await recoverOrphanedPublishJobs(now);

    // Atomically claim all due pending jobs in one statement.
    // Only rows still `pending` at the moment the UPDATE runs will be returned,
    // so a second concurrent tick gets an empty result set for the same rows.
    const claimedJobs = await db
      .update(publishJobsTable)
      .set({ status: "in_progress", updatedAt: now })
      .where(
        and(
          eq(publishJobsTable.status, "pending"),
          lte(publishJobsTable.scheduledAt, now),
        ),
      )
      .returning({ id: publishJobsTable.id });

    if (claimedJobs.length === 0) return;

    logger.info({ count: claimedJobs.length }, "Publish job scheduler: claimed jobs for execution");

    await Promise.allSettled(
      claimedJobs.map(async ({ id }) => {
        try {
          await executePublishJob(id);
          logger.info({ jobId: id }, "Publish job executed");
        } catch (err) {
          logger.error({ err, jobId: id }, "Publish job failed unexpectedly");
        }
      }),
    );
  } catch (err) {
    logger.error({ err }, "Publish job scheduler error");
  }
}

const WEEKLY_INTERVAL_MS   = 60 * 60 * 1000;       // check every hour; generateWeeklyDigests guards on Sunday
const DAILY_INTERVAL_MS    = 60 * 60 * 1000;       // check every hour; runDailyIngestionCycle guards on day
const PUBLISH_INTERVAL_MS  = 60 * 1000;            // every minute — pick up scheduled posts

export function startReminderScheduler(): { stop: () => void } {
  // Hourly: invoice reminders + overdue transitions
  runCycle();
  const hourlyInterval = setInterval(runCycle, INTERVAL_MS);

  // Hourly check for weekly digest (only generates on Sundays)
  runWeeklyCycle();
  const weeklyInterval = setInterval(runWeeklyCycle, WEEKLY_INTERVAL_MS);

  // Daily: pull real follower / reach data from connected platform APIs
  runDailyIngestionCycle();
  const ingestionInterval = setInterval(runDailyIngestionCycle, DAILY_INTERVAL_MS);

  // Every minute: fire any scheduled publish jobs that are due
  runPublishJobScheduler();
  const publishInterval = setInterval(runPublishJobScheduler, PUBLISH_INTERVAL_MS);

  logger.info(
    { intervalMs: INTERVAL_MS, publishIntervalMs: PUBLISH_INTERVAL_MS },
    "Payment reminder + weekly digest + platform ingestion + publish job scheduler started",
  );

  return {
    stop: () => {
      clearInterval(hourlyInterval);
      clearInterval(weeklyInterval);
      clearInterval(ingestionInterval);
      clearInterval(publishInterval);
      logger.info("Reminder + digest + ingestion + publish scheduler stopped");
    },
  };
}
