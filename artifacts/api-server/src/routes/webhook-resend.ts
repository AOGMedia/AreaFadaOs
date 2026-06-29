import { Router, type Request, type Response } from "express";
import crypto from "crypto";
import { db } from "@workspace/db";
import { emailSuppressionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger.js";

const router = Router();

/**
 * Verify the Resend webhook signature using the Svix HMAC-SHA256 scheme.
 * Resend delivers webhooks via Svix and signs every request using the same
 * `whsec_`-prefixed secret format as Clerk.
 *
 * Fails CLOSED — returns false when the secret is not configured, preventing
 * unauthenticated callers from injecting fake events.
 */
function verifyResendWebhookSignature(
  rawBody: Buffer,
  headers: Request["headers"],
): boolean {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    logger.error(
      "RESEND_WEBHOOK_SECRET is not set — rejecting Resend webhook request. " +
        "Set this environment variable (from Resend dashboard → Webhooks) to enable event processing.",
    );
    return false;
  }

  const msgId = headers["svix-id"] as string | undefined;
  const msgTimestamp = headers["svix-timestamp"] as string | undefined;
  const msgSignature = headers["svix-signature"] as string | undefined;

  if (!msgId || !msgTimestamp || !msgSignature) {
    logger.warn(
      "Resend webhook request missing svix-id / svix-timestamp / svix-signature headers",
    );
    return false;
  }

  const toSign = `${msgId}.${msgTimestamp}.${rawBody.toString("utf8")}`;
  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const computed = crypto
    .createHmac("sha256", secretBytes)
    .update(toSign)
    .digest("base64");

  const expectedSigs = msgSignature
    .split(" ")
    .map((s) => s.replace(/^v1,/, "").trim());

  return expectedSigs.some((sig) => {
    try {
      return crypto.timingSafeEqual(
        Buffer.from(computed, "base64"),
        Buffer.from(sig, "base64"),
      );
    } catch {
      return false;
    }
  });
}

/**
 * Upsert a suppression record for the given address.
 * Uses INSERT … ON CONFLICT DO NOTHING so re-deliveries of the same event are
 * safe (the unique constraint on `email` prevents duplicate rows).
 */
async function suppressEmail(opts: {
  email: string;
  reason: string;
  eventType: string;
  resendEmailId?: string;
}): Promise<void> {
  const { reason, eventType, resendEmailId } = opts;
  const email = opts.email.toLowerCase().trim();
  try {
    await db
      .insert(emailSuppressionsTable)
      .values({ email, reason, eventType, resendEmailId: resendEmailId ?? null })
      .onConflictDoNothing();
    logger.info({ email, eventType }, "Email address suppressed");
  } catch (err) {
    logger.error({ err, email, eventType }, "Failed to record email suppression");
    throw err;
  }
}

router.post("/webhooks/resend", async (req: Request, res: Response): Promise<void> => {
  const rawBody: Buffer = (req as any).rawBody;

  if (!rawBody || !Buffer.isBuffer(rawBody)) {
    res.status(400).json({ error: "Missing raw body" });
    return;
  }

  if (!verifyResendWebhookSignature(rawBody, req.headers)) {
    res.status(401).json({ error: "Invalid or unverifiable webhook signature" });
    return;
  }

  const event = req.body as { type: string; data: Record<string, any> };

  try {
    switch (event.type) {
      case "email.bounced": {
        const email: string | undefined = event.data?.to?.[0] ?? event.data?.email_id;
        const resendEmailId: string | undefined = event.data?.email_id;
        const bouncedAt: string | undefined = event.data?.bounced_at;

        if (!email || !email.includes("@")) {
          logger.warn({ data: event.data }, "email.bounced event missing valid email address");
          res.status(422).json({ error: "Event missing email address" });
          return;
        }

        await suppressEmail({
          email,
          reason: `Hard bounce${bouncedAt ? ` at ${bouncedAt}` : ""}`,
          eventType: "bounce",
          resendEmailId,
        });
        break;
      }

      case "email.complained": {
        const email: string | undefined = event.data?.to?.[0] ?? event.data?.email_id;
        const resendEmailId: string | undefined = event.data?.email_id;
        const complainedAt: string | undefined = event.data?.complained_at;

        if (!email || !email.includes("@")) {
          logger.warn({ data: event.data }, "email.complained event missing valid email address");
          res.status(422).json({ error: "Event missing email address" });
          return;
        }

        await suppressEmail({
          email,
          reason: `Spam complaint${complainedAt ? ` at ${complainedAt}` : ""}`,
          eventType: "complaint",
          resendEmailId,
        });
        break;
      }

      default:
        logger.info({ type: event.type }, "Resend webhook: unhandled event type (ignored)");
    }

    res.json({ received: true, type: event.type });
  } catch (err) {
    logger.error({ err, type: event.type }, "Resend webhook handler error");
    res.status(500).json({ error: "Webhook processing failed" });
  }
});

/**
 * Check whether an email address is suppressed (bounced or complained).
 * Returns true when the address should NOT receive mail.
 */
export async function isEmailSuppressed(email: string): Promise<boolean> {
  const [row] = await db
    .select({ id: emailSuppressionsTable.id })
    .from(emailSuppressionsTable)
    .where(eq(emailSuppressionsTable.email, email.toLowerCase().trim()))
    .limit(1);
  return row !== undefined;
}

export default router;
