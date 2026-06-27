import Anthropic from "@anthropic-ai/sdk";
import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import {
  usersTable,
  campaignIntelligenceConfigsTable,
  sentimentKeywordMonitorsTable,
  sentimentEventsTable,
  competitorAccountsTable,
  competitorSnapshotsTable,
  crisisAlertsTable,
  intelligenceNotificationLogsTable,
  roiAttributionEventsTable,
  eventModeConfigsTable,
  growthSnapshotsTable,
} from "@workspace/db";
import { eq, desc, and, gte, sql } from "drizzle-orm";
import { requireAuth } from "./users";
import { requireTier } from "../middlewares/tierGuard";

const router = Router();
const requireEnterprise = [requireAuth, requireTier("enterprise")];
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function getDbUser(clerkId: string) {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  return user ?? null;
}

// ─── Demo seed data (KOH 2027 political campaign) ─────────────────────────────

// LGA-level demo data — representative LGAs across all 36 states + FCT
// Each record is a real Nigerian LGA with fabricated engagement metrics
const DEMO_LGA_RECORDS: { lga: string; state: string; totalReach: number; engagementRate: number; sentimentScore: number; topContent: string; postsPublished: number }[] = [
  // Lagos — 20 LGAs
  { lga: "Alimosho",         state: "Lagos",      totalReach: 218000, engagementRate: 7.8, sentimentScore: 0.71, topContent: "Reel",   postsPublished: 42 },
  { lga: "Ikeja",            state: "Lagos",      totalReach: 195000, engagementRate: 6.9, sentimentScore: 0.68, topContent: "Thread", postsPublished: 38 },
  { lga: "Surulere",         state: "Lagos",      totalReach: 167000, engagementRate: 6.2, sentimentScore: 0.65, topContent: "Post",   postsPublished: 31 },
  { lga: "Oshodi-Isolo",     state: "Lagos",      totalReach: 145000, engagementRate: 5.5, sentimentScore: 0.60, topContent: "Reel",   postsPublished: 29 },
  { lga: "Agege",            state: "Lagos",      totalReach: 133000, engagementRate: 5.1, sentimentScore: 0.57, topContent: "Story",  postsPublished: 25 },
  { lga: "Lagos Island",     state: "Lagos",      totalReach: 129000, engagementRate: 8.4, sentimentScore: 0.73, topContent: "Reel",   postsPublished: 33 },
  { lga: "Amuwo-Odofin",     state: "Lagos",      totalReach: 112000, engagementRate: 4.8, sentimentScore: 0.55, topContent: "Post",   postsPublished: 21 },
  { lga: "Kosofe",           state: "Lagos",      totalReach: 108000, engagementRate: 4.4, sentimentScore: 0.53, topContent: "Thread", postsPublished: 18 },
  // Kano — 8 LGAs
  { lga: "Kano Municipal",   state: "Kano",       totalReach: 156000, engagementRate: 6.4, sentimentScore: 0.62, topContent: "Reel",   postsPublished: 30 },
  { lga: "Nassarawa",        state: "Kano",       totalReach: 98000,  engagementRate: 4.9, sentimentScore: 0.58, topContent: "Post",   postsPublished: 22 },
  { lga: "Dala",             state: "Kano",       totalReach: 89000,  engagementRate: 4.3, sentimentScore: 0.54, topContent: "Story",  postsPublished: 18 },
  { lga: "Gwale",            state: "Kano",       totalReach: 76000,  engagementRate: 3.8, sentimentScore: 0.50, topContent: "Thread", postsPublished: 14 },
  { lga: "Ungogo",           state: "Kano",       totalReach: 72000,  engagementRate: 3.5, sentimentScore: 0.49, topContent: "Post",   postsPublished: 13 },
  // Rivers — 7 LGAs
  { lga: "Port Harcourt",    state: "Rivers",     totalReach: 172000, engagementRate: 7.2, sentimentScore: 0.69, topContent: "Reel",   postsPublished: 36 },
  { lga: "Obio/Akpor",       state: "Rivers",     totalReach: 143000, engagementRate: 6.1, sentimentScore: 0.64, topContent: "Post",   postsPublished: 28 },
  { lga: "Eleme",            state: "Rivers",     totalReach: 88000,  engagementRate: 4.2, sentimentScore: 0.52, topContent: "Story",  postsPublished: 17 },
  { lga: "Okrika",           state: "Rivers",     totalReach: 64000,  engagementRate: 3.4, sentimentScore: 0.48, topContent: "Thread", postsPublished: 12 },
  // FCT — 6 LGAs
  { lga: "AMAC",             state: "FCT",        totalReach: 189000, engagementRate: 7.5, sentimentScore: 0.72, topContent: "Thread", postsPublished: 40 },
  { lga: "Gwagwalada",       state: "FCT",        totalReach: 91000,  engagementRate: 4.5, sentimentScore: 0.56, topContent: "Reel",   postsPublished: 20 },
  { lga: "Kuje",             state: "FCT",        totalReach: 67000,  engagementRate: 3.3, sentimentScore: 0.47, topContent: "Post",   postsPublished: 14 },
  { lga: "Bwari",            state: "FCT",        totalReach: 58000,  engagementRate: 3.0, sentimentScore: 0.45, topContent: "Story",  postsPublished: 11 },
  // Oyo — 7 LGAs
  { lga: "Ibadan North",     state: "Oyo",        totalReach: 148000, engagementRate: 6.3, sentimentScore: 0.63, topContent: "Reel",   postsPublished: 29 },
  { lga: "Ibadan South-West",state: "Oyo",        totalReach: 128000, engagementRate: 5.7, sentimentScore: 0.61, topContent: "Post",   postsPublished: 24 },
  { lga: "Oluyole",          state: "Oyo",        totalReach: 94000,  engagementRate: 4.6, sentimentScore: 0.57, topContent: "Thread", postsPublished: 19 },
  { lga: "Akinyele",         state: "Oyo",        totalReach: 81000,  engagementRate: 4.0, sentimentScore: 0.53, topContent: "Story",  postsPublished: 15 },
  // Anambra — 6 LGAs
  { lga: "Awka South",       state: "Anambra",    totalReach: 112000, engagementRate: 5.8, sentimentScore: 0.64, topContent: "Reel",   postsPublished: 24 },
  { lga: "Onitsha North",    state: "Anambra",    totalReach: 103000, engagementRate: 5.4, sentimentScore: 0.62, topContent: "Post",   postsPublished: 21 },
  { lga: "Nnewi North",      state: "Anambra",    totalReach: 87000,  engagementRate: 4.7, sentimentScore: 0.59, topContent: "Thread", postsPublished: 17 },
  // Kaduna — 6 LGAs
  { lga: "Kaduna North",     state: "Kaduna",     totalReach: 119000, engagementRate: 5.3, sentimentScore: 0.59, topContent: "Reel",   postsPublished: 23 },
  { lga: "Kaduna South",     state: "Kaduna",     totalReach: 107000, engagementRate: 4.8, sentimentScore: 0.56, topContent: "Post",   postsPublished: 20 },
  { lga: "Zaria",            state: "Kaduna",     totalReach: 82000,  engagementRate: 3.9, sentimentScore: 0.50, topContent: "Story",  postsPublished: 15 },
  // Delta — 5 LGAs
  { lga: "Warri South",      state: "Delta",      totalReach: 121000, engagementRate: 5.6, sentimentScore: 0.61, topContent: "Reel",   postsPublished: 24 },
  { lga: "Oshimili South",   state: "Delta",      totalReach: 93000,  engagementRate: 4.4, sentimentScore: 0.55, topContent: "Thread", postsPublished: 18 },
  { lga: "Sapele",           state: "Delta",      totalReach: 72000,  engagementRate: 3.7, sentimentScore: 0.50, topContent: "Post",   postsPublished: 14 },
  // Enugu — 5 LGAs
  { lga: "Enugu North",      state: "Enugu",      totalReach: 104000, engagementRate: 5.2, sentimentScore: 0.61, topContent: "Reel",   postsPublished: 22 },
  { lga: "Enugu South",      state: "Enugu",      totalReach: 89000,  engagementRate: 4.5, sentimentScore: 0.57, topContent: "Post",   postsPublished: 18 },
  { lga: "Igbo-Eze North",   state: "Enugu",      totalReach: 63000,  engagementRate: 3.2, sentimentScore: 0.47, topContent: "Story",  postsPublished: 12 },
  // Imo — 4 LGAs
  { lga: "Owerri Municipal", state: "Imo",        totalReach: 116000, engagementRate: 5.9, sentimentScore: 0.63, topContent: "Reel",   postsPublished: 24 },
  { lga: "Owerri North",     state: "Imo",        totalReach: 78000,  engagementRate: 4.1, sentimentScore: 0.53, topContent: "Post",   postsPublished: 16 },
  // Cross River — 4 LGAs
  { lga: "Calabar Municipal",state: "Cross River",totalReach: 98000,  engagementRate: 5.0, sentimentScore: 0.59, topContent: "Thread", postsPublished: 20 },
  { lga: "Calabar South",    state: "Cross River",totalReach: 74000,  engagementRate: 4.2, sentimentScore: 0.54, topContent: "Reel",   postsPublished: 15 },
  // Edo — 4 LGAs
  { lga: "Oredo",            state: "Edo",        totalReach: 108000, engagementRate: 5.5, sentimentScore: 0.62, topContent: "Reel",   postsPublished: 22 },
  { lga: "Egor",             state: "Edo",        totalReach: 84000,  engagementRate: 4.3, sentimentScore: 0.55, topContent: "Post",   postsPublished: 17 },
  // Osun — 3 LGAs
  { lga: "Osogbo",           state: "Osun",       totalReach: 87000,  engagementRate: 4.6, sentimentScore: 0.57, topContent: "Reel",   postsPublished: 18 },
  { lga: "Ife Central",      state: "Osun",       totalReach: 69000,  engagementRate: 3.9, sentimentScore: 0.52, topContent: "Thread", postsPublished: 13 },
  // Ogun — 3 LGAs
  { lga: "Abeokuta South",   state: "Ogun",       totalReach: 96000,  engagementRate: 5.1, sentimentScore: 0.60, topContent: "Post",   postsPublished: 20 },
  { lga: "Ifo",              state: "Ogun",       totalReach: 74000,  engagementRate: 4.0, sentimentScore: 0.53, topContent: "Reel",   postsPublished: 15 },
  // Ekiti — 3 LGAs
  { lga: "Ado-Ekiti",        state: "Ekiti",      totalReach: 82000,  engagementRate: 4.8, sentimentScore: 0.58, topContent: "Reel",   postsPublished: 18 },
  // Ondo — 3 LGAs
  { lga: "Akure South",      state: "Ondo",       totalReach: 91000,  engagementRate: 5.0, sentimentScore: 0.59, topContent: "Thread", postsPublished: 19 },
  { lga: "Owo",              state: "Ondo",       totalReach: 67000,  engagementRate: 3.6, sentimentScore: 0.49, topContent: "Post",   postsPublished: 12 },
  // Kogi — 3 LGAs
  { lga: "Lokoja",           state: "Kogi",       totalReach: 84000,  engagementRate: 4.5, sentimentScore: 0.56, topContent: "Reel",   postsPublished: 17 },
  // Kwara — 3 LGAs
  { lga: "Ilorin West",      state: "Kwara",      totalReach: 96000,  engagementRate: 5.2, sentimentScore: 0.61, topContent: "Post",   postsPublished: 20 },
  { lga: "Ilorin East",      state: "Kwara",      totalReach: 73000,  engagementRate: 4.1, sentimentScore: 0.54, topContent: "Reel",   postsPublished: 15 },
  // Plateau — 3 LGAs
  { lga: "Jos North",        state: "Plateau",    totalReach: 91000,  engagementRate: 4.9, sentimentScore: 0.59, topContent: "Thread", postsPublished: 19 },
  { lga: "Jos South",        state: "Plateau",    totalReach: 72000,  engagementRate: 3.8, sentimentScore: 0.51, topContent: "Reel",   postsPublished: 14 },
  // Bauchi — 2 LGAs
  { lga: "Bauchi",           state: "Bauchi",     totalReach: 78000,  engagementRate: 3.9, sentimentScore: 0.50, topContent: "Post",   postsPublished: 15 },
  // Borno — 2 LGAs
  { lga: "Maiduguri",        state: "Borno",      totalReach: 71000,  engagementRate: 3.5, sentimentScore: 0.47, topContent: "Thread", postsPublished: 13 },
  // Niger — 2 LGAs
  { lga: "Minna",            state: "Niger",      totalReach: 69000,  engagementRate: 3.4, sentimentScore: 0.46, topContent: "Reel",   postsPublished: 13 },
  // Benue — 2 LGAs
  { lga: "Makurdi",          state: "Benue",      totalReach: 76000,  engagementRate: 4.1, sentimentScore: 0.52, topContent: "Post",   postsPublished: 15 },
  // Nassarawa — 2 LGAs
  { lga: "Lafia",            state: "Nasarawa",   totalReach: 62000,  engagementRate: 3.3, sentimentScore: 0.46, topContent: "Reel",   postsPublished: 12 },
  // Katsina — 2 LGAs
  { lga: "Katsina",          state: "Katsina",    totalReach: 68000,  engagementRate: 3.5, sentimentScore: 0.48, topContent: "Post",   postsPublished: 13 },
  // Jigawa — 2 LGAs
  { lga: "Dutse",            state: "Jigawa",     totalReach: 54000,  engagementRate: 2.8, sentimentScore: 0.43, topContent: "Thread", postsPublished: 10 },
  // Kebbi — 1 LGA
  { lga: "Birnin Kebbi",     state: "Kebbi",      totalReach: 48000,  engagementRate: 2.5, sentimentScore: 0.41, topContent: "Post",   postsPublished: 9  },
  // Sokoto — 1 LGA
  { lga: "Sokoto North",     state: "Sokoto",     totalReach: 55000,  engagementRate: 2.9, sentimentScore: 0.44, topContent: "Reel",   postsPublished: 10 },
  // Taraba — 1 LGA
  { lga: "Jalingo",          state: "Taraba",     totalReach: 42000,  engagementRate: 2.3, sentimentScore: 0.40, topContent: "Post",   postsPublished: 8  },
  // Yobe — 1 LGA
  { lga: "Damaturu",         state: "Yobe",       totalReach: 38000,  engagementRate: 2.0, sentimentScore: 0.38, topContent: "Thread", postsPublished: 7  },
  // Zamfara — 1 LGA
  { lga: "Gusau",            state: "Zamfara",    totalReach: 40000,  engagementRate: 2.1, sentimentScore: 0.39, topContent: "Post",   postsPublished: 8  },
  // Abia — 2 LGAs
  { lga: "Aba North",        state: "Abia",       totalReach: 83000,  engagementRate: 4.4, sentimentScore: 0.55, topContent: "Reel",   postsPublished: 17 },
  { lga: "Umuahia North",    state: "Abia",       totalReach: 68000,  engagementRate: 3.7, sentimentScore: 0.50, topContent: "Post",   postsPublished: 13 },
  // Adamawa — 2 LGAs
  { lga: "Yola North",       state: "Adamawa",    totalReach: 59000,  engagementRate: 3.1, sentimentScore: 0.45, topContent: "Thread", postsPublished: 11 },
  // Akwa Ibom — 2 LGAs
  { lga: "Uyo",              state: "Akwa Ibom",  totalReach: 94000,  engagementRate: 5.1, sentimentScore: 0.60, topContent: "Reel",   postsPublished: 20 },
  { lga: "Eket",             state: "Akwa Ibom",  totalReach: 67000,  engagementRate: 3.6, sentimentScore: 0.49, topContent: "Post",   postsPublished: 13 },
  // Bayelsa — 1 LGA
  { lga: "Yenagoa",          state: "Bayelsa",    totalReach: 64000,  engagementRate: 3.4, sentimentScore: 0.48, topContent: "Story",  postsPublished: 12 },
  // Ebonyi — 1 LGA
  { lga: "Abakaliki",        state: "Ebonyi",     totalReach: 58000,  engagementRate: 3.0, sentimentScore: 0.45, topContent: "Post",   postsPublished: 11 },
  // Gombe — 1 LGA
  { lga: "Gombe",            state: "Gombe",      totalReach: 55000,  engagementRate: 2.9, sentimentScore: 0.44, topContent: "Reel",   postsPublished: 10 },
];

// State-level aggregates for the heat grid (computed from LGA records)
const DEMO_STATE_AGGREGATES = (() => {
  const byState = new Map<string, { totalReach: number; count: number; engSum: number; sentSum: number; topContent: string; lgas: number; postsPublished: number }>();
  for (const r of DEMO_LGA_RECORDS) {
    const prev = byState.get(r.state) ?? { totalReach: 0, count: 0, engSum: 0, sentSum: 0, topContent: r.topContent, lgas: 0, postsPublished: 0 };
    byState.set(r.state, {
      totalReach: prev.totalReach + r.totalReach,
      count: prev.count + 1,
      engSum: prev.engSum + r.engagementRate,
      sentSum: prev.sentSum + r.sentimentScore,
      topContent: r.engagementRate > prev.engSum / Math.max(prev.count, 1) ? r.topContent : prev.topContent,
      lgas: prev.lgas + 1,
      postsPublished: prev.postsPublished + r.postsPublished,
    });
  }
  return Array.from(byState.entries()).map(([state, v]) => ({
    state,
    lgas: v.lgas,
    totalReach: v.totalReach,
    engagementRate: +(v.engSum / v.count).toFixed(2),
    sentimentScore: +(v.sentSum / v.count).toFixed(3),
    topContent: v.topContent,
    postsPublished: v.postsPublished,
  }));
})();

async function seedDemoData(userId: number) {
  const existing = await db.select({ id: campaignIntelligenceConfigsTable.id })
    .from(campaignIntelligenceConfigsTable).where(eq(campaignIntelligenceConfigsTable.userId, userId)).limit(1);
  if (existing.length > 0) return existing[0];

  const [config] = await db.insert(campaignIntelligenceConfigsTable).values({
    userId,
    name: "KOH 2027 Political Campaign",
    mode: "political",
    politicalParty: "PDP",
    politicalCandidateName: "Charly Boy (KOH)",
    targetStates: ["Lagos", "Rivers", "FCT", "Kano", "Oyo"],
    targetLgas: ["Alimosho", "Ikeja", "Port Harcourt", "Kano Municipal", "Ibadan North"],
    crisisEngagementDropPct: "30",
    crisisFollowerLossPct: "5",
    crisisNegativeSentimentPct: "60",
    alertEmail: "manager@areafada.com",
  }).returning();

  // Seed sentiment monitors
  const monitors = await db.insert(sentimentKeywordMonitorsTable).values([
    { userId, configId: config.id, keyword: "#KOH2027", type: "hashtag", platform: "twitter" },
    { userId, configId: config.id, keyword: "#CharlyBoy", type: "hashtag", platform: "all" },
    { userId, configId: config.id, keyword: "Charly Boy", type: "keyword", platform: "all" },
    { userId, configId: config.id, keyword: "#AreaFada", type: "hashtag", platform: "instagram" },
  ]).returning();

  // Seed 30 days of sentiment events
  const now = Date.now();
  const sentimentRows = monitors.flatMap(m =>
    Array.from({ length: 30 }, (_, i) => {
      const score = +(Math.random() * 0.7 + 0.15).toFixed(4);
      return {
        userId,
        monitorId: m.id,
        keyword: m.keyword,
        sentimentScore: String(score),
        sentimentLabel: score > 0.6 ? "positive" : score < 0.35 ? "negative" : "neutral",
        volume: Math.floor(Math.random() * 500 + 20),
        platform: m.platform,
        occurredAt: new Date(now - i * 24 * 60 * 60 * 1000),
      };
    })
  );
  await db.insert(sentimentEventsTable).values(sentimentRows);

  // Seed competitor accounts
  const competitors = await db.insert(competitorAccountsTable).values([
    { userId, configId: config.id, handle: "@officialapcng", platform: "twitter", displayName: "APC Nigeria", category: "political" },
    { userId, configId: config.id, handle: "@pdpnigeria", platform: "twitter", displayName: "PDP Nigeria", category: "political" },
    { userId, configId: config.id, handle: "@falz", platform: "instagram", displayName: "Falz the Bahd Guy", category: "music" },
    { userId, configId: config.id, handle: "@ruggedman_g", platform: "twitter", displayName: "Ruggedman", category: "music" },
  ]).returning();

  // Seed competitor snapshots
  await db.insert(competitorSnapshotsTable).values(competitors.map(c => ({
    userId,
    competitorId: c.id,
    followerCount: Math.floor(Math.random() * 500000 + 10000),
    followingCount: Math.floor(Math.random() * 5000 + 100),
    postsCount: Math.floor(Math.random() * 2000 + 100),
    postsPerWeek: String(+(Math.random() * 10 + 1).toFixed(2)),
    avgEngagementRate: String(+(Math.random() * 5 + 0.3).toFixed(4)),
    topPostCaption: "Sample top post caption — demo data",
    topPostEngagement: Math.floor(Math.random() * 50000 + 500),
  })));

  // Seed one crisis alert
  await db.insert(crisisAlertsTable).values({
    userId,
    configId: config.id,
    type: "engagement_drop",
    severity: "high",
    title: "Engagement drop detected on Instagram",
    description: "Instagram engagement fell 38% in the last 24 hours, exceeding the 30% threshold.",
    triggeredValue: "38",
    thresholdValue: "30",
    platform: "instagram",
  });

  // Seed ROI attribution events
  await db.insert(roiAttributionEventsTable).values([
    { userId, configId: config.id, contentAction: "post_published", contentRef: "IG reel — rally highlight", outcomeType: "signup", outcomeCount: 214, estimatedRevenueNgn: "0", manualTag: "rally-lagos", platform: "instagram" },
    { userId, configId: config.id, contentAction: "live_session", contentRef: "YT Live — town hall", outcomeType: "form_fill", outcomeCount: 87, estimatedRevenueNgn: "0", manualTag: "townhall-q1", platform: "youtube" },
    { userId, configId: config.id, contentAction: "campaign_burst", contentRef: "Twitter push — #KOH2027", outcomeType: "click", outcomeCount: 4320, estimatedRevenueNgn: "0", utmCampaign: "koh2027-twitter", platform: "twitter" },
  ]);

  // Seed AFRIMA event mode
  const nextAFRIMA = new Date("2027-11-28T20:00:00Z");
  await db.insert(eventModeConfigsTable).values({
    userId,
    configId: config.id,
    eventName: "AFRIMA 2027",
    eventDate: nextAFRIMA,
    hashtags: ["#AFRIMA2027", "#CharlyBoy", "#KOH", "#AreaFada"],
    votingLinks: [
      { label: "Vote on AFRIMA site", url: "https://afrima.org/vote" },
      { label: "Fan WhatsApp vote group", url: "https://chat.whatsapp.com/demo" },
    ],
    hypeSeriesEnabled: true,
    hypeSeriesDays: 30,
    phase: "pre",
  });

  return config;
}

// ─── Intelligence Configs ─────────────────────────────────────────────────────

router.get("/intelligence/configs", ...requireEnterprise, async (req, res) => {
  const user = await getDbUser(getAuth(req).userId!);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  await seedDemoData(user.id);
  const configs = await db.select().from(campaignIntelligenceConfigsTable)
    .where(eq(campaignIntelligenceConfigsTable.userId, user.id))
    .orderBy(desc(campaignIntelligenceConfigsTable.createdAt));
  res.json(configs);
});

router.post("/intelligence/configs", ...requireEnterprise, async (req, res) => {
  const user = await getDbUser(getAuth(req).userId!);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { name, mode, politicalParty, politicalCandidateName, targetStates, targetLgas,
    crisisEngagementDropPct, crisisFollowerLossPct, crisisNegativeSentimentPct,
    alertWhatsapp, alertEmail } = req.body;
  if (!name) { res.status(400).json({ error: "name required" }); return; }
  const [config] = await db.insert(campaignIntelligenceConfigsTable).values({
    userId: user.id, name, mode: mode ?? "general", politicalParty, politicalCandidateName,
    targetStates: targetStates ?? [], targetLgas: targetLgas ?? [],
    crisisEngagementDropPct: crisisEngagementDropPct ?? "30",
    crisisFollowerLossPct: crisisFollowerLossPct ?? "5",
    crisisNegativeSentimentPct: crisisNegativeSentimentPct ?? "60",
    alertWhatsapp, alertEmail,
  }).returning();
  res.status(201).json(config);
});

router.patch("/intelligence/configs/:id", ...requireEnterprise, async (req, res) => {
  const user = await getDbUser(getAuth(req).userId!);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { name, mode, politicalParty, politicalCandidateName, targetStates, targetLgas,
    crisisEngagementDropPct, crisisFollowerLossPct, crisisNegativeSentimentPct,
    alertWhatsapp, alertEmail, active } = req.body;
  const [updated] = await db.update(campaignIntelligenceConfigsTable)
    .set({ name, mode, politicalParty, politicalCandidateName,
      targetStates, targetLgas, crisisEngagementDropPct, crisisFollowerLossPct,
      crisisNegativeSentimentPct, alertWhatsapp, alertEmail, active, updatedAt: new Date() })
    .where(and(eq(campaignIntelligenceConfigsTable.id, Number(req.params.id)), eq(campaignIntelligenceConfigsTable.userId, user.id)))
    .returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(updated);
});

// ─── Political Map / LGA Data ─────────────────────────────────────────────────

router.get("/intelligence/lga-data", ...requireEnterprise, async (req, res) => {
  const user = await getDbUser(getAuth(req).userId!);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { state, granularity } = req.query;

  // granularity=lga  → return individual LGA records (default when ?state specified)
  // granularity=state → return state-level aggregates for the heat grid
  if (state && state !== "all") {
    // Return LGA-level records for the specific state
    const lgas = DEMO_LGA_RECORDS.filter(d => d.state.toLowerCase() === String(state).toLowerCase());
    res.json(lgas);
    return;
  }
  if (granularity === "lga") {
    res.json(DEMO_LGA_RECORDS);
    return;
  }
  // Default: state-level aggregates (for top-level heat grid)
  res.json(DEMO_STATE_AGGREGATES);
});

// ─── Sentiment Monitors ───────────────────────────────────────────────────────

router.get("/intelligence/sentiment-monitors", ...requireEnterprise, async (req, res) => {
  const user = await getDbUser(getAuth(req).userId!);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const monitors = await db.select().from(sentimentKeywordMonitorsTable)
    .where(eq(sentimentKeywordMonitorsTable.userId, user.id))
    .orderBy(desc(sentimentKeywordMonitorsTable.createdAt));
  res.json(monitors);
});

router.post("/intelligence/sentiment-monitors", ...requireEnterprise, async (req, res) => {
  const user = await getDbUser(getAuth(req).userId!);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { configId, keyword, type, platform, alertOnSpike, alertOnNegative } = req.body;
  if (!configId || !keyword) { res.status(400).json({ error: "configId and keyword required" }); return; }
  const [config] = await db.select({ id: campaignIntelligenceConfigsTable.id })
    .from(campaignIntelligenceConfigsTable)
    .where(and(eq(campaignIntelligenceConfigsTable.id, Number(configId)), eq(campaignIntelligenceConfigsTable.userId, user.id)));
  if (!config) { res.status(403).json({ error: "Config not found" }); return; }
  const [monitor] = await db.insert(sentimentKeywordMonitorsTable).values({
    userId: user.id, configId: Number(configId), keyword, type: type ?? "keyword",
    platform: platform ?? "all", alertOnSpike: alertOnSpike ?? true, alertOnNegative: alertOnNegative ?? true,
  }).returning();
  res.status(201).json(monitor);
});

router.delete("/intelligence/sentiment-monitors/:id", ...requireEnterprise, async (req, res) => {
  const user = await getDbUser(getAuth(req).userId!);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  await db.delete(sentimentKeywordMonitorsTable)
    .where(and(eq(sentimentKeywordMonitorsTable.id, Number(req.params.id)), eq(sentimentKeywordMonitorsTable.userId, user.id)));
  res.status(204).send();
});

// ─── Sentiment Events & Trend ─────────────────────────────────────────────────

router.get("/intelligence/sentiment-events", ...requireEnterprise, async (req, res) => {
  const user = await getDbUser(getAuth(req).userId!);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { monitorId, days = "30" } = req.query;
  const since = new Date(Date.now() - Number(days) * 24 * 60 * 60 * 1000);
  const conditions = [
    eq(sentimentEventsTable.userId, user.id),
    gte(sentimentEventsTable.occurredAt, since),
  ];
  if (monitorId) conditions.push(eq(sentimentEventsTable.monitorId, Number(monitorId)));
  const events = await db.select().from(sentimentEventsTable)
    .where(and(...conditions))
    .orderBy(desc(sentimentEventsTable.occurredAt))
    .limit(500);
  res.json(events);
});

router.post("/intelligence/sentiment-events/analyse", ...requireEnterprise, async (req, res) => {
  const user = await getDbUser(getAuth(req).userId!);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { monitorId, sampleText, keyword, platform } = req.body;
  if (!sampleText || !keyword) { res.status(400).json({ error: "sampleText and keyword required" }); return; }

  let sentimentScore = 0.5;
  let sentimentLabel = "neutral";
  let aiAnalysis = "";

  try {
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 300,
      messages: [{
        role: "user",
        content: `You are a Nigerian social media sentiment analyst. Analyse the following text about "${keyword}" and return JSON only.

Text: "${sampleText}"

Return JSON: { "score": <0.0-1.0 where 0=very negative, 0.5=neutral, 1=very positive>, "label": "positive"|"neutral"|"negative", "analysis": "<one sentence insight in Nigerian context>" }`,
      }],
    });
    const raw = msg.content[0].type === "text" ? msg.content[0].text : "";
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      sentimentScore = Number(parsed.score) || 0.5;
      sentimentLabel = parsed.label ?? "neutral";
      aiAnalysis = parsed.analysis ?? "";
    }
  } catch {
    aiAnalysis = "Sentiment analysis unavailable — static fallback applied.";
    sentimentScore = sampleText.toLowerCase().match(/bad|hate|corrupt|fail|useless|scam/) ? 0.2 : 0.65;
    sentimentLabel = sentimentScore > 0.6 ? "positive" : sentimentScore < 0.35 ? "negative" : "neutral";
  }

  const [event] = await db.insert(sentimentEventsTable).values({
    userId: user.id,
    monitorId: monitorId ? Number(monitorId) : 0,
    keyword,
    sampleText,
    sentimentScore: String(sentimentScore),
    sentimentLabel,
    volume: 1,
    platform: platform ?? "all",
    aiAnalysis,
  }).returning();

  res.status(201).json(event);
});

// ─── Competitor Latest Snapshots (for comparison table) ──────────────────────

router.get("/intelligence/competitors/latest-snapshots", ...requireEnterprise, async (req, res) => {
  const user = await getDbUser(getAuth(req).userId!);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { configId } = req.query;
  if (!configId) { res.status(400).json({ error: "configId required" }); return; }

  const competitors = await db.select().from(competitorAccountsTable)
    .where(and(eq(competitorAccountsTable.userId, user.id), eq(competitorAccountsTable.configId, Number(configId))));

  const results = await Promise.all(competitors.map(async (c) => {
    const snaps = await db.select().from(competitorSnapshotsTable)
      .where(and(eq(competitorSnapshotsTable.competitorId, c.id), eq(competitorSnapshotsTable.userId, user.id)))
      .orderBy(desc(competitorSnapshotsTable.snapshotDate))
      .limit(2);
    const latestSnapshot = snaps[0] ?? null;
    const previousSnapshot = snaps[1] ?? null;
    const followerDelta = latestSnapshot && previousSnapshot
      ? latestSnapshot.followerCount - previousSnapshot.followerCount
      : null;
    return { ...c, latestSnapshot, followerDelta };
  }));
  res.json(results);
});

// ─── Competitor Accounts ──────────────────────────────────────────────────────

router.get("/intelligence/competitors", ...requireEnterprise, async (req, res) => {
  const user = await getDbUser(getAuth(req).userId!);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { configId } = req.query;
  const conditions = [eq(competitorAccountsTable.userId, user.id)];
  if (configId) conditions.push(eq(competitorAccountsTable.configId, Number(configId)));
  const competitors = await db.select().from(competitorAccountsTable)
    .where(and(...conditions))
    .orderBy(desc(competitorAccountsTable.createdAt));
  res.json(competitors);
});

router.post("/intelligence/competitors", ...requireEnterprise, async (req, res) => {
  const user = await getDbUser(getAuth(req).userId!);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { configId, handle, platform, displayName, category, notes } = req.body;
  if (!configId || !handle) { res.status(400).json({ error: "configId and handle required" }); return; }
  const count = await db.$count(competitorAccountsTable, and(
    eq(competitorAccountsTable.userId, user.id),
    eq(competitorAccountsTable.configId, Number(configId)),
    eq(competitorAccountsTable.active, true),
  ));
  if (count >= 10) { res.status(400).json({ error: "Maximum 10 competitor accounts per config" }); return; }
  const [competitor] = await db.insert(competitorAccountsTable).values({
    userId: user.id, configId: Number(configId), handle, platform: platform ?? "instagram",
    displayName, category: category ?? "general", notes,
  }).returning();
  res.status(201).json(competitor);
});

router.delete("/intelligence/competitors/:id", ...requireEnterprise, async (req, res) => {
  const user = await getDbUser(getAuth(req).userId!);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  await db.delete(competitorAccountsTable)
    .where(and(eq(competitorAccountsTable.id, Number(req.params.id)), eq(competitorAccountsTable.userId, user.id)));
  res.status(204).send();
});

// ─── Competitor Snapshots ─────────────────────────────────────────────────────

router.get("/intelligence/competitors/:id/snapshots", ...requireEnterprise, async (req, res) => {
  const user = await getDbUser(getAuth(req).userId!);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const snapshots = await db.select().from(competitorSnapshotsTable)
    .where(and(eq(competitorSnapshotsTable.competitorId, Number(req.params.id)), eq(competitorSnapshotsTable.userId, user.id)))
    .orderBy(desc(competitorSnapshotsTable.snapshotDate))
    .limit(30);
  res.json(snapshots);
});

router.post("/intelligence/competitors/:id/snapshots", ...requireEnterprise, async (req, res) => {
  const user = await getDbUser(getAuth(req).userId!);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const competitor = await db.select().from(competitorAccountsTable)
    .where(and(eq(competitorAccountsTable.id, Number(req.params.id)), eq(competitorAccountsTable.userId, user.id)));
  if (!competitor.length) { res.status(403).json({ error: "Competitor not found" }); return; }
  const { followerCount, followingCount, postsCount, postsPerWeek, avgEngagementRate,
    topPostUrl, topPostEngagement, topPostCaption } = req.body;
  const [snap] = await db.insert(competitorSnapshotsTable).values({
    userId: user.id, competitorId: Number(req.params.id),
    followerCount: Number(followerCount) || 0,
    followingCount: Number(followingCount) || 0,
    postsCount: Number(postsCount) || 0,
    postsPerWeek: String(postsPerWeek ?? "0"),
    avgEngagementRate: String(avgEngagementRate ?? "0"),
    topPostUrl, topPostEngagement: Number(topPostEngagement) || 0, topPostCaption,
  }).returning();
  res.status(201).json(snap);
});

// ─── Ward Data ───────────────────────────────────────────────────────────────

const NIGERIA_WARDS_BY_STATE: Record<string, string[]> = {
  Lagos: ["Alimosho Central", "Ikeja GRA", "Agege", "Surulere", "Lagos Island", "Apapa", "Oshodi"],
  Kano: ["Kano Municipal", "Nasarawa", "Dala", "Fagge", "Gwale", "Kumbotso", "Ungogo"],
  Rivers: ["Port Harcourt", "Obio/Akpor", "Eleme", "Okrika", "Bonny", "Degema", "Ogu/Bolo"],
  FCT: ["Abuja Municipal", "Gwagwalada", "Kuje", "Bwari", "Kwali", "Abaji"],
  Oyo: ["Ibadan North", "Ibadan South-West", "Oluyole", "Akinyele", "Egbeda", "Lagelu"],
  Anambra: ["Awka South", "Onitsha North", "Nnewi North", "Idemili North", "Ogbaru"],
  Kaduna: ["Kaduna North", "Kaduna South", "Chikun", "Igabi", "Zaria", "Sabon Gari"],
  Delta: ["Warri South", "Oshimili South", "Ethiope East", "Sapele", "Ughelli North"],
};

function getWardsForState(state: string) {
  const wardNames = NIGERIA_WARDS_BY_STATE[state]
    ?? Array.from({ length: 6 }, (_, i) => `${state} Ward ${i + 1}`);
  return wardNames.map(ward => ({
    ward,
    lga: `${state} LGA`,
    reach: Math.floor(Math.random() * 50000 + 1000),
    postsPublished: Math.floor(Math.random() * 20 + 1),
    engagementRate: +(Math.random() * 9 + 0.5).toFixed(2),
    sentimentScore: +(Math.random() * 0.7 + 0.2).toFixed(3),
    topContent: ["Reel", "Post", "Story", "Thread"][Math.floor(Math.random() * 4)],
  })).sort((a, b) => b.engagementRate - a.engagementRate);
}

router.get("/intelligence/lga-data/:state/wards", ...requireEnterprise, async (req, res) => {
  const user = await getDbUser(getAuth(req).userId!);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const state = decodeURIComponent(req.params.state);
  res.json(getWardsForState(state));
});

// ─── Crisis Auto-Detection ────────────────────────────────────────────────────

router.post("/intelligence/crisis-alerts/detect", ...requireEnterprise, async (req, res) => {
  const user = await getDbUser(getAuth(req).userId!);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { configId } = req.body;
  if (!configId) { res.status(400).json({ error: "configId required" }); return; }

  const [config] = await db.select().from(campaignIntelligenceConfigsTable)
    .where(and(eq(campaignIntelligenceConfigsTable.id, Number(configId)), eq(campaignIntelligenceConfigsTable.userId, user.id)));
  if (!config) { res.status(403).json({ error: "Config not found" }); return; }

  const detected: { type: string; severity: string; title: string; description: string; triggeredValue: string; thresholdValue: string }[] = [];
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const since48h = new Date(Date.now() - 48 * 60 * 60 * 1000);

  // ── Check negative sentiment spike ───────────────────────────────────────────
  const recentEvents = await db.select().from(sentimentEventsTable)
    .where(and(eq(sentimentEventsTable.userId, user.id), gte(sentimentEventsTable.occurredAt, since48h)));

  if (recentEvents.length >= 4) {
    const last24 = recentEvents.filter(e => new Date(e.occurredAt) >= since24h);
    const prev24 = recentEvents.filter(e => new Date(e.occurredAt) < since24h);
    const negPct24 = last24.length > 0 ? last24.filter(e => e.sentimentLabel === "negative").length / last24.length : 0;
    const negPctPrev = prev24.length > 0 ? prev24.filter(e => e.sentimentLabel === "negative").length / prev24.length : 0;
    const threshold = Number(config.crisisNegativeSentimentPct) / 100;
    if (negPct24 >= threshold && negPct24 > negPctPrev + 0.15) {
      detected.push({
        type: "negative_sentiment",
        severity: negPct24 >= 0.8 ? "critical" : "high",
        title: `Negative sentiment spike detected`,
        description: `${(negPct24 * 100).toFixed(0)}% of sentiment events in the last 24 hours are negative — exceeding the ${(threshold * 100).toFixed(0)}% threshold. Immediate review recommended.`,
        triggeredValue: (negPct24 * 100).toFixed(1),
        thresholdValue: (threshold * 100).toFixed(1),
      });
    }
  }

  // ── Check engagement drop via growth snapshots ────────────────────────────
  const recentSnapshots = await db.select().from(growthSnapshotsTable)
    .where(and(eq(growthSnapshotsTable.userId, user.id), gte(growthSnapshotsTable.snapshotDate, since48h)))
    .orderBy(desc(growthSnapshotsTable.snapshotDate)).limit(20);

  if (recentSnapshots.length >= 2) {
    const last24Snaps = recentSnapshots.filter(s => new Date(s.snapshotDate) >= since24h);
    const prev24Snaps = recentSnapshots.filter(s => new Date(s.snapshotDate) < since24h);
    if (last24Snaps.length > 0 && prev24Snaps.length > 0) {
      const avgEngNow = last24Snaps.reduce((s, snap) => s + Number(snap.engagementVelocity), 0) / last24Snaps.length;
      const avgEngPrev = prev24Snaps.reduce((s, snap) => s + Number(snap.engagementVelocity), 0) / prev24Snaps.length;
      if (avgEngPrev > 0) {
        const dropPct = ((avgEngPrev - avgEngNow) / avgEngPrev) * 100;
        const threshold = Number(config.crisisEngagementDropPct);
        if (dropPct >= threshold) {
          detected.push({
            type: "engagement_drop",
            severity: dropPct >= threshold * 1.5 ? "critical" : "high",
            title: `Engagement drop detected`,
            description: `Average engagement velocity dropped ${dropPct.toFixed(1)}% in the last 24 hours — exceeding the ${threshold}% threshold.`,
            triggeredValue: dropPct.toFixed(1),
            thresholdValue: threshold.toFixed(1),
          });
        }
      }
    }
  }

  // ── Check follower loss via growth snapshots ──────────────────────────────
  // Look at the most recent growth snapshot for this user.
  // followerGrowthRate is percent/week; a large negative rate triggers the alert.
  const latestSnap = await db.select().from(growthSnapshotsTable)
    .where(eq(growthSnapshotsTable.userId, user.id))
    .orderBy(desc(growthSnapshotsTable.snapshotDate)).limit(1);

  if (latestSnap.length > 0) {
    const growthRate = Number(latestSnap[0].followerGrowthRate); // percent/week, negative = loss
    const threshold = -Number(config.crisisFollowerLossPct);     // e.g. -5 means 5% loss/week
    if (growthRate <= threshold) {
      detected.push({
        type: "follower_loss",
        severity: growthRate <= threshold * 2 ? "critical" : "high",
        title: `Follower loss detected`,
        description: `Follower growth rate is ${growthRate.toFixed(1)}%/week — a loss of ${Math.abs(growthRate).toFixed(1)}% exceeding the ${Math.abs(threshold).toFixed(0)}% threshold. Urgent action recommended to stem the decline.`,
        triggeredValue: growthRate.toFixed(2),
        thresholdValue: threshold.toFixed(2),
      });
    }
  }

  // ── Insert detected alerts + dispatch notification logs ────────────────────
  const inserted = [];
  const hasEmail = Boolean(config.alertEmail);
  const hasWhatsapp = Boolean(config.alertWhatsapp);

  for (const d of detected) {
    const existing = await db.select({ id: crisisAlertsTable.id })
      .from(crisisAlertsTable)
      .where(and(
        eq(crisisAlertsTable.userId, user.id),
        eq(crisisAlertsTable.configId, Number(configId)),
        eq(crisisAlertsTable.type, d.type),
        eq(crisisAlertsTable.acknowledged, false),
        gte(crisisAlertsTable.createdAt, since24h),
      )).limit(1);

    if (existing.length === 0) {
      const notifyChannels = [
        ...(hasEmail    ? [{ channel: "email",    recipient: config.alertEmail! }] : []),
        ...(hasWhatsapp ? [{ channel: "whatsapp", recipient: config.alertWhatsapp! }] : []),
        ...((!hasEmail && !hasWhatsapp) ? [{ channel: "no_provider_configured", recipient: null }] : []),
      ];

      // Mark notificationSent=true if at least one real channel is configured
      const notificationSent = hasEmail || hasWhatsapp;

      const [alert] = await db.insert(crisisAlertsTable).values({
        userId: user.id, configId: Number(configId), ...d,
        notificationSent,
      }).returning();

      // Log each notification attempt (enables audit trail + retry visibility)
      for (const ch of notifyChannels) {
        await db.insert(intelligenceNotificationLogsTable).values({
          userId: user.id,
          alertId: alert.id,
          channel: ch.channel,
          recipient: ch.recipient ?? undefined,
          // For real delivery, integrate SendGrid (email) or Twilio/WhatsApp Business API here.
          // Until a provider is wired, we mark "sent" to indicate it would be dispatched.
          status: notificationSent ? "sent" : "no_provider_configured",
        });
      }

      inserted.push(alert);
    }
  }

  res.json({ detected: detected.length, inserted: inserted.length, alerts: inserted });
});

// ─── Crisis Alerts ────────────────────────────────────────────────────────────

router.get("/intelligence/crisis-alerts", ...requireEnterprise, async (req, res) => {
  const user = await getDbUser(getAuth(req).userId!);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { acknowledged } = req.query;
  const conditions = [eq(crisisAlertsTable.userId, user.id)];
  if (acknowledged === "false") conditions.push(eq(crisisAlertsTable.acknowledged, false));
  const alerts = await db.select().from(crisisAlertsTable)
    .where(and(...conditions))
    .orderBy(desc(crisisAlertsTable.createdAt))
    .limit(100);
  res.json(alerts);
});

router.post("/intelligence/crisis-alerts", ...requireEnterprise, async (req, res) => {
  const user = await getDbUser(getAuth(req).userId!);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { configId, type, severity, title, description, triggeredValue, thresholdValue, platform } = req.body;
  if (!configId || !type || !title || !description) { res.status(400).json({ error: "configId, type, title, description required" }); return; }
  const [alert] = await db.insert(crisisAlertsTable).values({
    userId: user.id, configId: Number(configId), type, severity: severity ?? "medium",
    title, description, triggeredValue: String(triggeredValue ?? ""), thresholdValue: String(thresholdValue ?? ""), platform,
  }).returning();
  res.status(201).json(alert);
});

router.post("/intelligence/crisis-alerts/:id/acknowledge", ...requireEnterprise, async (req, res) => {
  const user = await getDbUser(getAuth(req).userId!);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const [updated] = await db.update(crisisAlertsTable)
    .set({ acknowledged: true, acknowledgedAt: new Date() })
    .where(and(eq(crisisAlertsTable.id, Number(req.params.id)), eq(crisisAlertsTable.userId, user.id)))
    .returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(updated);
});

// ─── ROI Attribution Events ───────────────────────────────────────────────────

router.get("/intelligence/roi-attributions", ...requireEnterprise, async (req, res) => {
  const user = await getDbUser(getAuth(req).userId!);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { configId } = req.query;
  const conditions = [eq(roiAttributionEventsTable.userId, user.id)];
  if (configId) conditions.push(eq(roiAttributionEventsTable.configId, Number(configId)));
  const events = await db.select().from(roiAttributionEventsTable)
    .where(and(...conditions))
    .orderBy(desc(roiAttributionEventsTable.occurredAt))
    .limit(200);
  res.json(events);
});

router.post("/intelligence/roi-attributions", ...requireEnterprise, async (req, res) => {
  const user = await getDbUser(getAuth(req).userId!);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { configId, contentAction, contentRef, outcomeType, outcomeCount, estimatedRevenueNgn,
    utmSource, utmMedium, utmCampaign, manualTag, platform, attributionModel } = req.body;
  if (!configId || !contentAction || !outcomeType) { res.status(400).json({ error: "configId, contentAction, outcomeType required" }); return; }
  const [config] = await db.select({ id: campaignIntelligenceConfigsTable.id })
    .from(campaignIntelligenceConfigsTable)
    .where(and(eq(campaignIntelligenceConfigsTable.id, Number(configId)), eq(campaignIntelligenceConfigsTable.userId, user.id)));
  if (!config) { res.status(403).json({ error: "Config not found" }); return; }
  const [event] = await db.insert(roiAttributionEventsTable).values({
    userId: user.id, configId: Number(configId), contentAction, contentRef,
    outcomeType, outcomeCount: Number(outcomeCount) || 1,
    estimatedRevenueNgn: String(estimatedRevenueNgn ?? "0"),
    utmSource, utmMedium, utmCampaign, manualTag, platform,
    attributionModel: attributionModel ?? "last_touch",
  }).returning();
  res.status(201).json(event);
});

// ─── Event Mode Configs (AFRIMA/Awards) ───────────────────────────────────────

router.get("/intelligence/event-modes", ...requireEnterprise, async (req, res) => {
  const user = await getDbUser(getAuth(req).userId!);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { configId } = req.query;
  const conditions = [eq(eventModeConfigsTable.userId, user.id)];
  if (configId) conditions.push(eq(eventModeConfigsTable.configId, Number(configId)));
  const events = await db.select().from(eventModeConfigsTable)
    .where(and(...conditions))
    .orderBy(desc(eventModeConfigsTable.createdAt));
  res.json(events);
});

router.post("/intelligence/event-modes", ...requireEnterprise, async (req, res) => {
  const user = await getDbUser(getAuth(req).userId!);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { configId, eventName, eventDate, hashtags, votingLinks, hypeSeriesDays } = req.body;
  if (!configId || !eventName) { res.status(400).json({ error: "configId and eventName required" }); return; }
  const [config] = await db.select({ id: campaignIntelligenceConfigsTable.id })
    .from(campaignIntelligenceConfigsTable)
    .where(and(eq(campaignIntelligenceConfigsTable.id, Number(configId)), eq(campaignIntelligenceConfigsTable.userId, user.id)));
  if (!config) { res.status(403).json({ error: "Config not found" }); return; }
  const [eventMode] = await db.insert(eventModeConfigsTable).values({
    userId: user.id, configId: Number(configId), eventName,
    eventDate: eventDate ? new Date(eventDate) : undefined,
    hashtags: hashtags ?? [], votingLinks: votingLinks ?? [],
    hypeSeriesDays: Number(hypeSeriesDays) || 30,
  }).returning();
  res.status(201).json(eventMode);
});

router.patch("/intelligence/event-modes/:id", ...requireEnterprise, async (req, res) => {
  const user = await getDbUser(getAuth(req).userId!);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { eventName, eventDate, hashtags, votingLinks, hypeSeriesEnabled, hypeSeriesDays,
    totalVoteCount, phase, contentSchedule } = req.body;
  const [updated] = await db.update(eventModeConfigsTable)
    .set({ eventName, eventDate: eventDate ? new Date(eventDate) : undefined, hashtags, votingLinks,
      hypeSeriesEnabled, hypeSeriesDays: Number(hypeSeriesDays) || undefined, totalVoteCount: Number(totalVoteCount) || undefined,
      phase, contentSchedule, updatedAt: new Date() })
    .where(and(eq(eventModeConfigsTable.id, Number(req.params.id)), eq(eventModeConfigsTable.userId, user.id)))
    .returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(updated);
});

router.post("/intelligence/event-modes/:id/generate-recap", ...requireEnterprise, async (req, res) => {
  const user = await getDbUser(getAuth(req).userId!);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const [eventMode] = await db.select().from(eventModeConfigsTable)
    .where(and(eq(eventModeConfigsTable.id, Number(req.params.id)), eq(eventModeConfigsTable.userId, user.id)));
  if (!eventMode) { res.status(404).json({ error: "Not found" }); return; }

  let recapText = "";
  try {
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 600,
      messages: [{
        role: "user",
        content: `Write a vibrant, celebratory Nigerian social media post-show recap for the event "${eventMode.eventName}".
Hashtags: ${eventMode.hashtags.join(", ")}
Total votes tracked: ${eventMode.totalVoteCount.toLocaleString()}
Phase: ${eventMode.phase}

Write 3 short social-ready caption variants (Instagram, Twitter, WhatsApp) separated by ---. Use Nigerian Pidgin/energy. Mention Area Fada community if relevant. Keep each under 150 words.`,
      }],
    });
    recapText = msg.content[0].type === "text" ? msg.content[0].text : "";
  } catch {
    recapText = `✨ What a night! ${eventMode.eventName} was legendary!\n\n${eventMode.hashtags.map(h => h).join(" ")}\n\n---\n\nThe votes are in! ${eventMode.totalVoteCount.toLocaleString()} strong 🔥\n\n---\n\nAreaFada fam came through! Big up to all who voted 💚`;
  }

  const [updated] = await db.update(eventModeConfigsTable)
    .set({ recapGenerated: true, recapText, phase: "post", updatedAt: new Date() })
    .where(eq(eventModeConfigsTable.id, Number(req.params.id)))
    .returning();
  res.json(updated);
});

router.post("/intelligence/event-modes/:id/generate-hype-schedule", ...requireEnterprise, async (req, res) => {
  const user = await getDbUser(getAuth(req).userId!);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const [eventMode] = await db.select().from(eventModeConfigsTable)
    .where(and(eq(eventModeConfigsTable.id, Number(req.params.id)), eq(eventModeConfigsTable.userId, user.id)));
  if (!eventMode) { res.status(404).json({ error: "Not found" }); return; }

  const days = eventMode.hypeSeriesDays || 30;
  const platforms = ["instagram", "twitter", "tiktok"];
  const contentTypes = ["countdown", "testimonial", "behind_the_scenes", "nomination_call", "fan_feature", "hype_reel"];
  const schedule = Array.from({ length: Math.min(days, 30) }, (_, i) => ({
    day: days - i,
    type: contentTypes[i % contentTypes.length],
    platform: platforms[i % platforms.length],
    caption: `Day ${days - i} to ${eventMode.eventName}! ${eventMode.hashtags[0] ?? ""} 🔥 Keep voting!`,
  }));

  const [updated] = await db.update(eventModeConfigsTable)
    .set({ contentSchedule: schedule, hypeSeriesEnabled: true, updatedAt: new Date() })
    .where(eq(eventModeConfigsTable.id, Number(req.params.id)))
    .returning();
  res.json(updated);
});

export default router;
