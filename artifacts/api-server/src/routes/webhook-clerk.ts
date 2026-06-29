import { Router, type Request, type Response } from "express";
import crypto from "crypto";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger.js";

const router = Router();

const ENTERPRISE_EMAILS = new Set(
  (process.env.ENTERPRISE_EMAILS ?? "osejialexander77@gmail.com")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
);

function resolveInitialTier(email?: string): string {
  if (email && ENTERPRISE_EMAILS.has(email.toLowerCase())) return "enterprise";
  return "creator";
}

function verifyClerkWebhookSignature(
  rawBody: Buffer,
  headers: Request["headers"]
): boolean {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    logger.warn("CLERK_WEBHOOK_SECRET is not set — skipping webhook signature verification (set this env var in production)");
    return true;
  }

  const msgId = headers["svix-id"] as string | undefined;
  const msgTimestamp = headers["svix-timestamp"] as string | undefined;
  const msgSignature = headers["svix-signature"] as string | undefined;

  if (!msgId || !msgTimestamp || !msgSignature) {
    logger.warn("Clerk webhook missing svix headers");
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
        Buffer.from(sig, "base64")
      );
    } catch {
      return false;
    }
  });
}

async function upsertUserFromClerk(
  clerkId: string,
  email?: string,
  name?: string
): Promise<void> {
  const existing = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.clerkId, clerkId))
    .limit(1);

  if (existing.length > 0) {
    const user = existing[0];
    if (email && ENTERPRISE_EMAILS.has(email.toLowerCase()) && user.tier !== "enterprise") {
      await db
        .update(usersTable)
        .set({ tier: "enterprise", updatedAt: new Date() })
        .where(eq(usersTable.clerkId, clerkId));
      logger.info({ clerkId }, "Webhook: elevated user to enterprise tier");
    }
    return;
  }

  await db.insert(usersTable).values({
    clerkId,
    email: email || `${clerkId}@areafadaos.app`,
    displayName: name || "Area Fada",
    tier: resolveInitialTier(email),
  });
  logger.info({ clerkId, email }, "Webhook: created user row from Clerk event");
}

router.post("/webhooks/clerk", async (req: Request, res: Response): Promise<void> => {
  const rawBody: Buffer = (req as any).rawBody;

  if (!rawBody || !Buffer.isBuffer(rawBody)) {
    res.status(400).json({ error: "Missing raw body" });
    return;
  }

  if (!verifyClerkWebhookSignature(rawBody, req.headers)) {
    res.status(401).json({ error: "Invalid webhook signature" });
    return;
  }

  const event = req.body as { type: string; data: Record<string, any> };

  try {
    if (event.type === "user.created" || event.type === "session.created") {
      let clerkId: string;
      let email: string | undefined;
      let name: string | undefined;

      if (event.type === "user.created") {
        clerkId = event.data.id;
        const primaryEmail = (event.data.email_addresses ?? []).find(
          (e: any) => e.id === event.data.primary_email_address_id
        );
        email = primaryEmail?.email_address;
        const first = event.data.first_name ?? "";
        const last = event.data.last_name ?? "";
        name = [first, last].filter(Boolean).join(" ") || undefined;
      } else {
        clerkId = event.data.user_id;
      }

      await upsertUserFromClerk(clerkId!, email, name);
    }

    res.json({ received: true, type: event.type });
  } catch (err) {
    logger.error({ err, type: event.type }, "Clerk webhook handler error");
    res.status(500).json({ error: "Webhook processing failed" });
  }
});

export default router;
