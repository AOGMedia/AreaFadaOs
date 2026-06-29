import { Router } from "express";
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
 *
 * curl -X PATCH https://<host>/api/admin/promote \
 *   -H "Content-Type: application/json" \
 *   -H "x-admin-secret: <ADMIN_SECRET>" \
 *   -d '{"email":"osejialexander77@gmail.com","tier":"enterprise"}'
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
