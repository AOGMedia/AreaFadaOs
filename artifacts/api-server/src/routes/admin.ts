import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireTier } from "../middlewares/tierGuard.js";

const router = Router();

const VALID_TIERS = new Set(["free", "creator", "brand", "agency", "enterprise"]);

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
