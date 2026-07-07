import { Router } from "express";
import { requireAuth } from "./users";
import { requireTier } from "../middlewares/tierGuard";
import { db } from "@workspace/db";
import { usersTable, activityLogTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

const router = Router();

router.get("/dashboard/summary", requireAuth, async (req: any, res): Promise<void> => {
  try {
    const summary = {
      postsScheduled: 24,
      revenueThisMonth: 4750,
      activeBrandDeals: 3,
      ambassadorCount: 47,
      fanHubMembers: 312,
      totalReach: 128400,
      platformsConnected: 5,
      aiCaptionsGenerated: 89,
    };
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: "Failed to get dashboard summary" });
  }
});

router.get("/dashboard/activity", requireAuth, async (req: any, res): Promise<void> => {
  try {
    const user = await db.select().from(usersTable).where(eq(usersTable.clerkId, req.clerkUserId)).limit(1);
    if (!user.length) {
      res.json([]);
      return;
    }

    const logs = await db.select()
      .from(activityLogTable)
      .where(eq(activityLogTable.userId, user[0].id))
      .orderBy(desc(activityLogTable.createdAt))
      .limit(20);

    if (logs.length === 0) {
      const seed = [
        { type: "post_scheduled", description: "Scheduled Instagram post for '999' book launch campaign" },
        { type: "brand_deal", description: "New brand deal inquiry from Paystack Nigeria" },
        { type: "ambassador", description: "Lagos state ambassador Tunde completed 3 tasks" },
        { type: "revenue", description: "Invoice #INV-0047 paid — NGN 250,000 by BrandX" },
        { type: "fan_hub", description: "15 new Area Fada Fans verified their '999' purchase" },
        { type: "ai_caption", description: "Generated 12 Pidgin captions for TikTok campaign" },
        { type: "live_session", description: "Charly Boy live Q&A scheduled for July 31 — 2,100 reminder opt-ins" },
        { type: "promo_link", description: "999/ig link hit 1,000 clicks — 234 download conversions" },
      ];
      await db.insert(activityLogTable).values(
        seed.map((s) => ({ userId: user[0].id, type: s.type, description: s.description })),
      );
      const fresh = await db.select().from(activityLogTable)
        .where(eq(activityLogTable.userId, user[0].id))
        .orderBy(desc(activityLogTable.createdAt))
        .limit(20);
      res.json(fresh.map((a) => ({
        id: a.id,
        type: a.type,
        description: a.description,
        metadata: a.metadata ? JSON.parse(a.metadata) : null,
        createdAt: a.createdAt,
      })));
      return;
    }

    res.json(logs.map((a) => ({
      id: a.id,
      type: a.type,
      description: a.description,
      metadata: a.metadata ? JSON.parse(a.metadata) : null,
      createdAt: a.createdAt,
    })));
  } catch (err) {
    res.status(500).json({ error: "Failed to get activity" });
  }
});

router.get("/modules/analytics", requireTier("brand"), async (_req: any, res): Promise<void> => {
  res.json({ status: "available", message: "Analytics module is active on your plan" });
});

router.get("/modules/ambassador-crm", requireTier("agency"), async (_req: any, res): Promise<void> => {
  res.json({ status: "available", message: "Ambassador CRM is active on your plan" });
});

router.get("/modules/fan-hub", requireTier("agency"), async (_req: any, res): Promise<void> => {
  res.json({ status: "available", message: "Fan Hub is active on your plan" });
});

router.get("/modules/campaign-intelligence", requireTier("enterprise"), async (_req: any, res): Promise<void> => {
  res.json({ status: "available", message: "Campaign Intelligence is active on your plan" });
});

export default router;
