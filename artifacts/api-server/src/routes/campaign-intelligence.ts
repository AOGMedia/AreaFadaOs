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
  roiAttributionEventsTable,
  eventModeConfigsTable,
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

const NIGERIA_STATES = [
  "Abia","Adamawa","Akwa Ibom","Anambra","Bauchi","Bayelsa","Benue","Borno",
  "Cross River","Delta","Ebonyi","Edo","Ekiti","Enugu","FCT","Gombe","Imo",
  "Jigawa","Kaduna","Kano","Katsina","Kebbi","Kogi","Kwara","Lagos","Nasarawa",
  "Niger","Ogun","Ondo","Osun","Oyo","Plateau","Rivers","Sokoto","Taraba","Yobe","Zamfara",
];

const DEMO_LGA_DATA = NIGERIA_STATES.map(state => ({
  state,
  lgas: Math.floor(Math.random() * 15 + 5),
  totalReach: Math.floor(Math.random() * 200000 + 5000),
  engagementRate: +(Math.random() * 8 + 0.5).toFixed(2),
  sentimentScore: +(Math.random() * 0.6 + 0.2).toFixed(3),
  topContent: ["Reel", "Post", "Story", "Thread"][Math.floor(Math.random() * 4)],
  postsPublished: Math.floor(Math.random() * 40 + 2),
}));

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
  const { state } = req.query;
  let data = DEMO_LGA_DATA;
  if (state && state !== "all") {
    data = data.filter(d => d.state.toLowerCase() === String(state).toLowerCase());
  }
  res.json(data);
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
