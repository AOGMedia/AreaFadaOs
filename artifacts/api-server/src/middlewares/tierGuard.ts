import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export type Tier = "free" | "creator" | "brand" | "agency" | "enterprise";

const TIER_RANK: Record<Tier, number> = {
  free: 0,
  creator: 1,
  brand: 2,
  agency: 3,
  enterprise: 4,
};

export function requireTier(minimumTier: Tier) {
  return async (req: any, res: any, next: any): Promise<void> => {
    const auth = getAuth(req);
    const rawId = auth?.sessionClaims?.userId || auth?.userId;
    const clerkUserId = typeof rawId === "string" ? rawId : null;

    if (!clerkUserId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    try {
      const users = await db
        .select({ tier: usersTable.tier })
        .from(usersTable)
        .where(eq(usersTable.clerkId, clerkUserId))
        .limit(1);

      if (!users.length) {
        res.status(401).json({ error: "User not found" });
        return;
      }

      const userTier = users[0].tier as Tier;
      const userRank = TIER_RANK[userTier] ?? 0;
      const requiredRank = TIER_RANK[minimumTier] ?? 0;

      if (userRank < requiredRank) {
        res.status(403).json({
          error: "Upgrade required",
          requiredTier: minimumTier,
          currentTier: userTier,
          upgradeUrl: "/sign-up",
        });
        return;
      }

      req.clerkUserId = clerkUserId;
      req.userTier = userTier;
      next();
    } catch (err) {
      res.status(500).json({ error: "Tier check failed" });
    }
  };
}
