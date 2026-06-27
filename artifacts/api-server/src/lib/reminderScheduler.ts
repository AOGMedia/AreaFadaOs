import { db } from "@workspace/db";
import { invoicesTable, paymentRemindersTable } from "@workspace/db";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import { logger } from "./logger";

const REMINDER_DAYS = [3, 7, 14];
const INTERVAL_MS = 60 * 60 * 1000; // check every hour

async function processOverdueReminders() {
  try {
    const now = new Date();
    let totalLogged = 0;

    for (const days of REMINDER_DAYS) {
      const windowStart = new Date(now.getTime() - (days + 1) * 86_400_000);
      const windowEnd = new Date(now.getTime() - days * 86_400_000);

      // Find overdue invoices whose due date falls exactly in this window
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
        // Skip if already reminded in the last 24h
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

    if (totalLogged > 0) {
      logger.info({ totalLogged }, "Automated reminder cycle complete");
    }
  } catch (err) {
    logger.error({ err }, "Reminder scheduler error");
  }
}

export function startReminderScheduler() {
  // Run once immediately on startup, then every hour
  processOverdueReminders();
  const interval = setInterval(processOverdueReminders, INTERVAL_MS);
  logger.info({ intervalMs: INTERVAL_MS }, "Payment reminder scheduler started");
  return interval;
}
