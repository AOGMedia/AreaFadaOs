import { db } from "@workspace/db";
import { invoicesTable, paymentRemindersTable } from "@workspace/db";
import { eq, and, gte, lte, lt, sql } from "drizzle-orm";
import { logger } from "./logger";

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

export function startReminderScheduler() {
  // Run immediately on startup then every hour
  runCycle();
  const interval = setInterval(runCycle, INTERVAL_MS);
  logger.info({ intervalMs: INTERVAL_MS }, "Payment reminder scheduler started");
  return interval;
}
