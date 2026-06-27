import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { usersTable, activityLogTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

const requireAuth = (req: any, res: any, next: any) => {
  const auth = getAuth(req);
  const userId = auth?.sessionClaims?.userId || auth?.userId;
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  req.clerkUserId = userId;
  next();
};

const TIER_FEATURES: Record<string, { name: string; price: number | null; features: string[]; modules: Record<string, boolean> }> = {
  free: {
    name: "Free",
    price: 0,
    features: ["1 platform", "10 posts/month", "Basic scheduling"],
    modules: {
      scheduling: true, monetization: false, analytics: false,
      ambassadorCrm: false, bookPromo: false, liveVideo: false,
      clipEngine: false, autoPost: false, trafficTools: false,
      fanHub: false, campaignIntelligence: false,
    },
  },
  creator: {
    name: "Creator",
    price: 49,
    features: ["Multi-platform scheduling", "Monetization dashboard", "Basic analytics", "AI captions", "Paystack invoicing"],
    modules: {
      scheduling: true, monetization: true, analytics: true,
      ambassadorCrm: false, bookPromo: true, liveVideo: false,
      clipEngine: false, autoPost: true, trafficTools: false,
      fanHub: false, campaignIntelligence: false,
    },
  },
  brand: {
    name: "Brand",
    price: 199,
    features: ["Everything in Creator", "Full analytics & reporting", "White-label reports", "3 team seats", "Live video module"],
    modules: {
      scheduling: true, monetization: true, analytics: true,
      ambassadorCrm: false, bookPromo: true, liveVideo: true,
      clipEngine: true, autoPost: true, trafficTools: true,
      fanHub: false, campaignIntelligence: false,
    },
  },
  agency: {
    name: "Agency",
    price: 499,
    features: ["Everything in Brand", "10 client seats", "Ambassador CRM", "36-state network", "Fan Hub", "All modules"],
    modules: {
      scheduling: true, monetization: true, analytics: true,
      ambassadorCrm: true, bookPromo: true, liveVideo: true,
      clipEngine: true, autoPost: true, trafficTools: true,
      fanHub: true, campaignIntelligence: false,
    },
  },
  enterprise: {
    name: "Enterprise",
    price: null,
    features: ["Everything in Agency", "Campaign Intelligence", "Political campaign mode", "Custom integrations", "Dedicated support", "SLA"],
    modules: {
      scheduling: true, monetization: true, analytics: true,
      ambassadorCrm: true, bookPromo: true, liveVideo: true,
      clipEngine: true, autoPost: true, trafficTools: true,
      fanHub: true, campaignIntelligence: true,
    },
  },
};

async function getOrCreateUser(clerkId: string, email?: string, name?: string) {
  const existing = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId)).limit(1);
  if (existing.length > 0) return existing[0];

  const [created] = await db.insert(usersTable).values({
    clerkId,
    email: email || `${clerkId}@areafadaos.app`,
    displayName: name || "Area Fada",
    tier: "creator",
  }).returning();
  return created;
}

router.get("/users/me", requireAuth, async (req: any, res) => {
  try {
    const user = await getOrCreateUser(req.clerkUserId);
    res.json({
      id: user.id,
      clerkId: user.clerkId,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      tier: user.tier,
      bio: user.bio,
      country: user.country,
      createdAt: user.createdAt,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to get user" });
  }
});

router.patch("/users/me", requireAuth, async (req: any, res) => {
  try {
    const { displayName, bio, country, avatarUrl } = req.body;
    const [updated] = await db.update(usersTable)
      .set({ displayName, bio, country, avatarUrl, updatedAt: new Date() })
      .where(eq(usersTable.clerkId, req.clerkUserId))
      .returning();
    res.json({
      id: updated.id,
      clerkId: updated.clerkId,
      email: updated.email,
      displayName: updated.displayName,
      avatarUrl: updated.avatarUrl,
      tier: updated.tier,
      bio: updated.bio,
      country: updated.country,
      createdAt: updated.createdAt,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to update user" });
  }
});

router.get("/users/me/tier", requireAuth, async (req: any, res) => {
  try {
    const user = await getOrCreateUser(req.clerkUserId);
    const tierKey = user.tier as keyof typeof TIER_FEATURES;
    const tierData = TIER_FEATURES[tierKey] || TIER_FEATURES.free;
    res.json({
      tier: user.tier,
      tierName: tierData.name,
      monthlyPrice: tierData.price,
      features: tierData.features,
      moduleAccess: tierData.modules,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to get tier info" });
  }
});

export { requireAuth };
export default router;
