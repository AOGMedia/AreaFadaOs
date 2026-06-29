import { db } from "@workspace/db";
import { invoicesTable, paymentRemindersTable, analyticsSnapshots, weeklyDigests, usersTable } from "@workspace/db";
import { eq, and, gte, lte, lt, sql, desc } from "drizzle-orm";
import { logger } from "./logger";
import { runDailyIngestion } from "./platformDataFetcher.js";

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

    // Stub: Resend email delivery
    const userRow = await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    const email = userRow[0]?.email;
    if (email) {
      // TODO: Replace with Resend SDK call when RESEND_API_KEY is configured
      // const resend = new Resend(process.env.RESEND_API_KEY);
      // await resend.emails.send({ from: "digest@areafada.com", to: email, subject: "Your weekly performance digest", text: narrative });
      logger.info({ userId, email, weekEnd: weekEnd.toISOString() }, "[DIGEST EMAIL STUB] Weekly digest ready — Resend delivery pending API key configuration");
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
      emailSent: false,
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

const WEEKLY_INTERVAL_MS = 60 * 60 * 1000; // check every hour; generateWeeklyDigests guards on Sunday
const DAILY_INTERVAL_MS  = 60 * 60 * 1000; // check every hour; runDailyIngestionCycle guards on day

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

  logger.info({ intervalMs: INTERVAL_MS }, "Payment reminder + weekly digest + platform ingestion scheduler started");

  return {
    stop: () => {
      clearInterval(hourlyInterval);
      clearInterval(weeklyInterval);
      clearInterval(ingestionInterval);
      logger.info("Reminder + digest + ingestion scheduler stopped");
    },
  };
}
