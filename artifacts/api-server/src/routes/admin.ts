import { Router } from "express";
import { Resend } from "resend";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireTier } from "../middlewares/tierGuard.js";

const router = Router();

const VALID_TIERS = new Set(["free", "creator", "brand", "agency", "enterprise"]);

/**
 * PATCH /api/admin/promote
 * One-off bootstrap endpoint to force-upgrade any account by email.
 * Protected by x-admin-secret header checked against ADMIN_SECRET env var.
 * Returns 501 if ADMIN_SECRET is not configured.
 */
router.patch("/admin/promote", async (req, res): Promise<void> => {
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) {
    res.status(501).json({ error: "ADMIN_SECRET not configured — endpoint disabled" });
    return;
  }

  const providedSecret = req.headers["x-admin-secret"];
  if (!providedSecret || providedSecret !== adminSecret) {
    res.status(401).json({ error: "Invalid admin secret" });
    return;
  }

  const { email, tier } = req.body as { email?: string; tier?: string };
  if (!email || !tier || !VALID_TIERS.has(tier)) {
    res.status(400).json({ error: "email and valid tier required", validTiers: [...VALID_TIERS] });
    return;
  }

  try {
    const [updated] = await db
      .update(usersTable)
      .set({ tier, updatedAt: new Date() })
      .where(eq(usersTable.email, email.toLowerCase()))
      .returning({ id: usersTable.id, email: usersTable.email, tier: usersTable.tier });

    if (!updated) {
      res.status(404).json({ error: `No user found with email: ${email}` });
      return;
    }

    res.json({ promoted: updated });
  } catch (err) {
    res.status(500).json({ error: "Promote failed" });
  }
});

/**
 * POST /api/admin/notify-enterprise
 * Send a broadcast announcement email to all enterprise-tier users in the DB.
 * Protected by x-admin-secret header.
 */
router.post("/admin/notify-enterprise", async (req, res): Promise<void> => {
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) {
    res.status(501).json({ error: "ADMIN_SECRET not configured — endpoint disabled" });
    return;
  }

  const providedSecret = req.headers["x-admin-secret"];
  if (!providedSecret || providedSecret !== adminSecret) {
    res.status(401).json({ error: "Invalid admin secret" });
    return;
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    res.status(501).json({ error: "RESEND_API_KEY not configured" });
    return;
  }

  const fromEmail = process.env.RESEND_FROM_EMAIL ?? "AreaFada OS <no-reply@areafada.com>";
  const { subject, htmlBody } = req.body as { subject?: string; htmlBody?: string };
  if (!subject || !htmlBody) {
    res.status(400).json({ error: "subject and htmlBody are required" });
    return;
  }

  try {
    const enterpriseUsers = await db
      .select({ id: usersTable.id, email: usersTable.email, displayName: usersTable.displayName })
      .from(usersTable)
      .where(eq(usersTable.tier, "enterprise"));

    if (enterpriseUsers.length === 0) {
      res.json({ sent: 0, skipped: 0, message: "No enterprise users found" });
      return;
    }

    const resend = new Resend(resendKey);
    const results: { email: string; status: "sent" | "error"; detail?: string }[] = [];

    for (const user of enterpriseUsers) {
      if (!user.email || user.email.includes("@areafadaos.app")) {
        results.push({ email: user.email ?? "(none)", status: "error", detail: "Placeholder email — skipped" });
        continue;
      }
      try {
        await resend.emails.send({
          from: fromEmail,
          to: user.email,
          subject,
          html: htmlBody,
        });
        results.push({ email: user.email, status: "sent" });
      } catch (sendErr: any) {
        results.push({ email: user.email, status: "error", detail: String(sendErr?.message ?? sendErr) });
      }
    }

    const sent = results.filter(r => r.status === "sent").length;
    const skipped = results.filter(r => r.status === "error").length;
    res.json({ sent, skipped, results });
  } catch (err) {
    res.status(500).json({ error: "Notify failed" });
  }
});

router.get(
  "/admin/users",
  requireTier("enterprise"),
  async (_req, res): Promise<void> => {
    try {
      const users = await db
        .select({
          id: usersTable.id,
          clerkId: usersTable.clerkId,
          email: usersTable.email,
          displayName: usersTable.displayName,
          tier: usersTable.tier,
          createdAt: usersTable.createdAt,
        })
        .from(usersTable)
        .orderBy(desc(usersTable.createdAt));

      res.json({ users });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch users" });
    }
  }
);

router.patch(
  "/admin/users/:id/tier",
  requireTier("enterprise"),
  async (req, res): Promise<void> => {
    const userId = parseInt(req.params.id, 10);
    const { tier } = req.body as { tier: string };

    if (isNaN(userId)) {
      res.status(400).json({ error: "Invalid user id" });
      return;
    }

    if (!tier || !VALID_TIERS.has(tier)) {
      res.status(400).json({ error: "Invalid tier", validTiers: [...VALID_TIERS] });
      return;
    }

    try {
      const self = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.clerkId, (req as any).clerkUserId))
        .limit(1);

      if (self.length && self[0].id === userId) {
        res.status(403).json({
          error: "You cannot change your own tier. Ask another enterprise admin to do this.",
        });
        return;
      }

      const [updated] = await db
        .update(usersTable)
        .set({ tier, updatedAt: new Date() })
        .where(eq(usersTable.id, userId))
        .returning({
          id: usersTable.id,
          email: usersTable.email,
          tier: usersTable.tier,
        });

      if (!updated) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      res.json({ user: updated });
    } catch (err) {
      res.status(500).json({ error: "Failed to update tier" });
    }
  }
);

export default router;
