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

/**
 * Verify Clerk webhook signature using HMAC-SHA256.
 * Fails CLOSED — returns false if the secret is not configured.
 */
function verifyClerkWebhookSignature(
  rawBody: Buffer,
  headers: Request["headers"]
): boolean {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    logger.error(
      "CLERK_WEBHOOK_SECRET is not set — rejecting webhook request. " +
        "Set this environment variable (from Clerk dashboard → Webhooks) to enable webhook processing."
    );
    return false;
  }

  const msgId = headers["svix-id"] as string | undefined;
  const msgTimestamp = headers["svix-timestamp"] as string | undefined;
  const msgSignature = headers["svix-signature"] as string | undefined;

  if (!msgId || !msgTimestamp || !msgSignature) {
    logger.warn("Clerk webhook request missing svix-id / svix-timestamp / svix-signature headers");
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

/**
 * Fetch a Clerk user profile from the Clerk Backend API.
 * Returns null if CLERK_SECRET_KEY is not set or the request fails.
 */
async function fetchClerkUser(
  clerkId: string
): Promise<{ email?: string; name?: string } | null> {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    logger.warn(
      { clerkId },
      "CLERK_SECRET_KEY not set — cannot fetch user profile from Clerk API"
    );
    return null;
  }

  try {
    const resp = await fetch(`https://api.clerk.com/v1/users/${clerkId}`, {
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!resp.ok) {
      logger.warn({ clerkId, status: resp.status }, "Clerk API returned non-OK status fetching user");
      return null;
    }

    const data = (await resp.json()) as Record<string, any>;

    const primaryEmailId = data.primary_email_address_id as string | undefined;
    const emailAddresses = (data.email_addresses ?? []) as Array<{
      id: string;
      email_address: string;
    }>;
    const primary = emailAddresses.find((e) => e.id === primaryEmailId);
    const email = primary?.email_address;

    const first = (data.first_name as string | undefined) ?? "";
    const last = (data.last_name as string | undefined) ?? "";
    const name = [first, last].filter(Boolean).join(" ") || undefined;

    return { email, name };
  } catch (err) {
    logger.error({ err, clerkId }, "Error fetching user from Clerk API");
    return null;
  }
}

/**
 * Upsert a user row from a Clerk event.
 * - If the user exists: check and apply enterprise promotion if warranted.
 * - If the user does not exist: create with the provided email/name (or skip if unavailable).
 */
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
    const resolvedEmail = email || user.email;
    if (ENTERPRISE_EMAILS.has(resolvedEmail.toLowerCase()) && user.tier !== "enterprise") {
      await db
        .update(usersTable)
        .set({ tier: "enterprise", updatedAt: new Date() })
        .where(eq(usersTable.clerkId, clerkId));
      logger.info({ clerkId }, "Webhook: elevated existing user to enterprise tier");
    }
    return;
  }

  if (!email) {
    logger.warn({ clerkId }, "Webhook: skipping row creation — no email available for new user");
    return;
  }

  await db.insert(usersTable).values({
    clerkId,
    email,
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
    res.status(401).json({ error: "Invalid or unverifiable webhook signature" });
    return;
  }

  const event = req.body as { type: string; data: Record<string, any> };

  try {
    if (event.type === "user.created") {
      const clerkId: string = event.data.id;
      const primaryEmailId = event.data.primary_email_address_id;
      const primaryEmail = (event.data.email_addresses ?? []).find(
        (e: any) => e.id === primaryEmailId
      );
      let email: string | undefined = primaryEmail?.email_address;
      const first = (event.data.first_name as string | undefined) ?? "";
      const last = (event.data.last_name as string | undefined) ?? "";
      let name: string | undefined = [first, last].filter(Boolean).join(" ") || undefined;

      if (!email) {
        logger.warn(
          { clerkId },
          "Webhook: user.created payload missing email — fetching from Clerk API (OAuth user)"
        );
        const profile = await fetchClerkUser(clerkId);
        email = profile?.email;
        name = name || profile?.name;
        if (!email) {
          logger.warn(
            { clerkId },
            "Webhook: user.created — no email in payload or Clerk API; row creation deferred to session.created"
          );
        }
      }

      await upsertUserFromClerk(clerkId, email, name);
    } else if (event.type === "session.created") {
      const clerkId: string = event.data.user_id;

      const existing = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.clerkId, clerkId))
        .limit(1);

      if (existing.length > 0) {
        const user = existing[0];
        if (ENTERPRISE_EMAILS.has(user.email.toLowerCase()) && user.tier !== "enterprise") {
          await db
            .update(usersTable)
            .set({ tier: "enterprise", updatedAt: new Date() })
            .where(eq(usersTable.clerkId, clerkId));
          logger.info({ clerkId }, "Webhook: session.created — elevated user to enterprise tier");
        }
      } else {
        const profile = await fetchClerkUser(clerkId);
        await upsertUserFromClerk(clerkId, profile?.email, profile?.name);
      }
    }

    res.json({ received: true, type: event.type });
  } catch (err) {
    logger.error({ err, type: event.type }, "Clerk webhook handler error");
    res.status(500).json({ error: "Webhook processing failed" });
  }
});

export default router;
