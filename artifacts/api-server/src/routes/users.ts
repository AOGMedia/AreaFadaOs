import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

const requireAuth = (req: any, res: any, next: any) => {
  const auth = getAuth(req);
  const rawId = auth?.sessionClaims?.userId || auth?.userId;
  const userId = typeof rawId === "string" ? rawId : null;
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  req.clerkUserId = userId;

  // Extract email from JWT session claims so routes can pass the real
  // email address to getOrCreateUser on first login.
  //
  // REQUIRED CLERK CONFIG — Clerk Auth pane → JWT Templates → "Default session token":
  //   Add claim:  email  →  {{user.primary_email_address}}
  //
  // Once saved, every JWT will include the email claim and req.clerkEmail
  // is always populated here, making the fetchEmailFromClerk() fallback below
  // a no-op in normal operation.
  const claims = auth?.sessionClaims as Record<string, unknown> | null | undefined;
  const rawEmail = claims?.email ?? claims?.primaryEmailAddress;
  req.clerkEmail = typeof rawEmail === "string" && rawEmail ? rawEmail.toLowerCase() : undefined;

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

// Comma-separated list of emails that receive enterprise tier automatically.
// Set via ENTERPRISE_EMAILS env var in production; a platform default is included
// so the account works before the var is configured.
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
 * Fetch the primary email address for a Clerk user via the Clerk Backend API.
 * Returns undefined if CLERK_SECRET_KEY is not set or the request fails.
 *
 * Safety-net fallback only — this should never be called in normal operation
 * once the Clerk JWT template is configured to include the `email` claim
 * (Clerk Auth pane → JWT Templates → "Default session token" → add
 *  `email: {{user.primary_email_address}}`).
 */
async function fetchEmailFromClerk(clerkId: string): Promise<string | undefined> {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) return undefined;

  try {
    const resp = await fetch(`https://api.clerk.com/v1/users/${clerkId}`, {
      headers: { Authorization: `Bearer ${secretKey}` },
    });
    if (!resp.ok) return undefined;

    const data = (await resp.json()) as Record<string, any>;
    const primaryEmailId = data.primary_email_address_id as string | undefined;
    const emailAddresses = (data.email_addresses ?? []) as Array<{
      id: string;
      email_address: string;
    }>;
    const primary = emailAddresses.find((e) => e.id === primaryEmailId);
    return primary?.email_address?.toLowerCase();
  } catch {
    return undefined;
  }
}

async function getOrCreateUser(clerkId: string, email?: string, name?: string) {
  const existing = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId)).limit(1);
  if (existing.length > 0) return existing[0];

  const [created] = await db.insert(usersTable).values({
    clerkId,
    email: email || `${clerkId}@areafadaos.app`,
    displayName: name || "Area Fada",
    tier: resolveInitialTier(email),
  }).returning();
  return created;
}

router.get("/users/me", requireAuth, async (req: any, res): Promise<void> => {
  try {
    let user = await getOrCreateUser(req.clerkUserId, req.clerkEmail);

    // If the stored email is a placeholder, try to get the real email.
    // First attempt: use the email from JWT session claims (req.clerkEmail).
    // Fallback: call the Clerk Backend API when JWT claims don't include email.
    if (user.email.endsWith("@areafadaos.app")) {
      const realEmail = req.clerkEmail ?? await fetchEmailFromClerk(req.clerkUserId);
      if (realEmail) {
        const [healed] = await db.update(usersTable)
          .set({ email: realEmail, updatedAt: new Date() })
          .where(eq(usersTable.clerkId, req.clerkUserId))
          .returning();
        user = healed;
      }
    }

    if (ENTERPRISE_EMAILS.has(user.email.toLowerCase()) && user.tier !== "enterprise") {
      const [upgraded] = await db.update(usersTable)
        .set({ tier: "enterprise", updatedAt: new Date() })
        .where(eq(usersTable.clerkId, req.clerkUserId))
        .returning();
      user = upgraded;
    }

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

router.patch("/users/me", requireAuth, async (req: any, res): Promise<void> => {
  try {
    const { displayName, bio, country, avatarUrl } = req.body;

    await getOrCreateUser(req.clerkUserId);

    const [updated] = await db.update(usersTable)
      .set({
        ...(displayName !== undefined && { displayName }),
        ...(bio !== undefined && { bio }),
        ...(country !== undefined && { country }),
        ...(avatarUrl !== undefined && { avatarUrl }),
        updatedAt: new Date(),
      })
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

router.get("/users/me/tier", requireAuth, async (req: any, res): Promise<void> => {
  try {
    let user = await getOrCreateUser(req.clerkUserId, req.clerkEmail);

    // Same placeholder-email heal as in /users/me (JWT claim + Clerk API fallback)
    if (user.email.endsWith("@areafadaos.app")) {
      const realEmail = req.clerkEmail ?? await fetchEmailFromClerk(req.clerkUserId);
      if (realEmail) {
        const [healed] = await db.update(usersTable)
          .set({ email: realEmail, updatedAt: new Date() })
          .where(eq(usersTable.clerkId, req.clerkUserId))
          .returning();
        user = healed;
      }
    }

    if (ENTERPRISE_EMAILS.has(user.email.toLowerCase()) && user.tier !== "enterprise") {
      const [upgraded] = await db.update(usersTable)
        .set({ tier: "enterprise", updatedAt: new Date() })
        .where(eq(usersTable.clerkId, req.clerkUserId))
        .returning();
      user = upgraded;
    }

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
