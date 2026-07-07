import Anthropic from "@anthropic-ai/sdk";
import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import {
  trafficCampaignsTable,
  campaignChannelConfigsTable,
  trafficEventsTable,
  growthSnapshotsTable,
  hookLibraryEntriesTable,
  seoContentPiecesTable,
  usersTable,
  microInfluencersTable,
  postsTable,
} from "@workspace/db";
import { eq, desc, and, gte, sql } from "drizzle-orm";
import { requireAuth } from "./users";
import { requireTier } from "../middlewares/tierGuard";

const router = Router();
const requireTraffic = [requireAuth, requireTier("brand")];

async function getDbUser(clerkId: string) {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  return user ?? null;
}

// ─── Africa audience presets for Meta Ads ────────────────────────────────────
const META_AUDIENCE_PRESETS = [
  { id: "ng_18_35", label: "Nigeria 18–35", country: "NG", ageMin: 18, ageMax: 35, interests: ["music", "fashion", "entrepreneurship"] },
  { id: "gh_urban", label: "Ghana Urban", country: "GH", ageMin: 20, ageMax: 40, interests: ["urban lifestyle", "business"] },
  { id: "ng_diaspora_uk", label: "Nigerian Diaspora (UK)", country: "GB", ageMin: 22, ageMax: 45, interests: ["Nigeria", "Afrobeats", "African culture"] },
  { id: "ng_diaspora_us", label: "Nigerian Diaspora (US)", country: "US", ageMin: 22, ageMax: 45, interests: ["Nigeria", "Afrobeats", "African culture"] },
  { id: "ng_diaspora_uae", label: "Nigerian Diaspora (UAE)", country: "AE", ageMin: 25, ageMax: 45, interests: ["Nigeria", "expat", "entrepreneurship"] },
  { id: "wa_youth", label: "West Africa Youth 16–30", country: "NG,GH,SN,CI", ageMin: 16, ageMax: 30, interests: ["music", "entertainment", "tech"] },
];

// ─── Seeded hook library (curated) ───────────────────────────────────────────
const CURATED_HOOKS = [
  { title: "Confession opener", hookText: "I need to be honest with you about something I've been hiding for years...", platform: "all", niche: "general", format: "opener", tags: ["vulnerable", "curiosity"] },
  { title: "Bold claim", hookText: "This one strategy made me ₦10M in 90 days — and nobody talks about it.", platform: "instagram", niche: "business", format: "caption", tags: ["income", "nigeria", "bold"] },
  { title: "List hook", hookText: "5 things successful Nigerian creators do before 8am:", platform: "twitter", niche: "lifestyle", format: "opener", tags: ["list", "productivity"] },
  { title: "Problem agitate", hookText: "Your content is GOOD. So why is nobody watching? Here's the real reason.", platform: "tiktok", niche: "general", format: "opener", tags: ["pain", "creator"] },
  { title: "Nollywood twist", hookText: "Episode 1: My brand deal fell through. What happened next shocked everyone.", platform: "instagram", niche: "general", format: "opener", tags: ["nollywood", "storytelling"] },
  { title: "Diaspora hook", hookText: "Living in the UK/US? Here's what Nigerian brands wish you knew.", platform: "instagram", niche: "lifestyle", format: "caption", tags: ["diaspora", "nigeria"] },
  { title: "Gospel niche", hookText: "God showed me this scripture and my business changed overnight.", platform: "all", niche: "gospel", format: "opener", tags: ["faith", "gospel", "business"] },
  { title: "Music tease", hookText: "This sound has been stuck in my head for 3 days. Now I'm dropping it.", platform: "tiktok", niche: "music", format: "opener", tags: ["music", "tease"] },
  { title: "Controversial take", hookText: "Unpopular opinion: most Nigerian influencers are broke. Here's proof.", platform: "twitter", niche: "general", format: "caption", tags: ["controversy", "nigeria"] },
  { title: "Thumbnail formula", hookText: "Before/After: How I grew from 0 to 100K followers in 6 months [face + numbers]", platform: "youtube", niche: "general", format: "thumbnail", tags: ["growth", "thumbnail"] },
  { title: "CTA urgency", hookText: "Comment 'FADA' below and I'll send you the free resource directly.", platform: "instagram", niche: "general", format: "cta", tags: ["cta", "engagement", "areafada"] },
  { title: "Tech founder hook", hookText: "I quit my Lagos bank job to build a startup. 3 years later — honest update.", platform: "twitter", niche: "tech", format: "opener", tags: ["startup", "lagos", "tech"] },
];

// ─── Traffic Campaigns ────────────────────────────────────────────────────────

router.get("/traffic-campaigns", ...requireTraffic, async (req, res) => {
  const user = await getDbUser(getAuth(req).userId!);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const campaigns = await db.select().from(trafficCampaignsTable)
    .where(eq(trafficCampaignsTable.userId, user.id))
    .orderBy(desc(trafficCampaignsTable.createdAt));
  res.json(campaigns);
});

router.post("/traffic-campaigns", ...requireTraffic, async (req, res) => {
  const user = await getDbUser(getAuth(req).userId!);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { name, destinationUrl, budgetNgn, startDate, endDate, goal, targetRegion } = req.body;
  if (!name || !destinationUrl) { res.status(400).json({ error: "name and destinationUrl required" }); return; }
  const [campaign] = await db.insert(trafficCampaignsTable).values({
    userId: user.id,
    name,
    destinationUrl,
    budgetNgn: budgetNgn ?? "0",
    startDate: startDate ? new Date(startDate) : undefined,
    endDate: endDate ? new Date(endDate) : undefined,
    goal: goal ?? "visits",
    targetRegion: targetRegion ?? "NG",
  }).returning();
  // Auto-create default channel config rows
  const channels = ["organic_social", "whatsapp", "meta_ads", "influencer", "tiktok_spark", "email"];
  await db.insert(campaignChannelConfigsTable).values(
    channels.map(ch => ({ campaignId: campaign.id, userId: user.id, channel: ch }))
  );
  res.status(201).json(campaign);
});

router.get("/traffic-campaigns/:id", ...requireTraffic, async (req, res) => {
  const user = await getDbUser(getAuth(req).userId!);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const [campaign] = await db.select().from(trafficCampaignsTable)
    .where(and(eq(trafficCampaignsTable.id, Number(req.params.id)), eq(trafficCampaignsTable.userId, user.id)));
  if (!campaign) { res.status(404).json({ error: "Not found" }); return; }
  const channels = await db.select().from(campaignChannelConfigsTable)
    .where(and(eq(campaignChannelConfigsTable.campaignId, campaign.id), eq(campaignChannelConfigsTable.userId, user.id)));
  res.json({ ...campaign, channels });
});

router.patch("/traffic-campaigns/:id", ...requireTraffic, async (req, res) => {
  const user = await getDbUser(getAuth(req).userId!);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { name, destinationUrl, budgetNgn, startDate, endDate, goal, targetRegion, status } = req.body;
  const [updated] = await db.update(trafficCampaignsTable)
    .set({
      ...(name && { name }),
      ...(destinationUrl && { destinationUrl }),
      ...(budgetNgn !== undefined && { budgetNgn }),
      ...(startDate !== undefined && { startDate: startDate ? new Date(startDate) : null }),
      ...(endDate !== undefined && { endDate: endDate ? new Date(endDate) : null }),
      ...(goal && { goal }),
      ...(targetRegion && { targetRegion }),
      ...(status && { status }),
      updatedAt: new Date(),
    })
    .where(and(eq(trafficCampaignsTable.id, Number(req.params.id)), eq(trafficCampaignsTable.userId, user.id)))
    .returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(updated);
});

router.delete("/traffic-campaigns/:id", ...requireTraffic, async (req, res) => {
  const user = await getDbUser(getAuth(req).userId!);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  await db.delete(campaignChannelConfigsTable)
    .where(and(eq(campaignChannelConfigsTable.campaignId, Number(req.params.id)), eq(campaignChannelConfigsTable.userId, user.id)));
  await db.delete(trafficCampaignsTable)
    .where(and(eq(trafficCampaignsTable.id, Number(req.params.id)), eq(trafficCampaignsTable.userId, user.id)));
  res.status(204).send();
});

// ─── Channel configs ──────────────────────────────────────────────────────────

router.get("/traffic-campaigns/:id/channels", ...requireTraffic, async (req, res) => {
  const user = await getDbUser(getAuth(req).userId!);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const channels = await db.select().from(campaignChannelConfigsTable)
    .where(and(eq(campaignChannelConfigsTable.campaignId, Number(req.params.id)), eq(campaignChannelConfigsTable.userId, user.id)));
  res.json(channels);
});

router.patch("/traffic-campaigns/:id/channels/:channelId", ...requireTraffic, async (req, res) => {
  const user = await getDbUser(getAuth(req).userId!);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { enabled, budgetAllocationNgn, settings, status } = req.body;
  const [updated] = await db.update(campaignChannelConfigsTable)
    .set({
      ...(enabled !== undefined && { enabled }),
      ...(budgetAllocationNgn !== undefined && { budgetAllocationNgn }),
      ...(settings && { settings }),
      ...(status && { status }),
      ...(enabled === true && { activatedAt: new Date() }),
      updatedAt: new Date(),
    })
    .where(and(
      eq(campaignChannelConfigsTable.id, Number(req.params.channelId)),
      eq(campaignChannelConfigsTable.userId, user.id),
    ))
    .returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(updated);
});

// ─── Meta Ads audience presets ────────────────────────────────────────────────

router.get("/traffic/meta-audience-presets", ...requireTraffic, async (_req, res) => {
  res.json(META_AUDIENCE_PRESETS);
});

// ─── Influencer activation for a campaign ────────────────────────────────────

router.get("/traffic-campaigns/:id/influencer-activations", ...requireTraffic, async (req, res) => {
  const user = await getDbUser(getAuth(req).userId!);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  // Return influencers from micro-influencer directory with activation settings from channel config
  const influencers = await db.select().from(microInfluencersTable)
    .where(eq(microInfluencersTable.userId, user.id))
    .orderBy(desc(microInfluencersTable.followerCount))
    .limit(50);
  const [channel] = await db.select().from(campaignChannelConfigsTable)
    .where(and(
      eq(campaignChannelConfigsTable.campaignId, Number(req.params.id)),
      eq(campaignChannelConfigsTable.userId, user.id),
      eq(campaignChannelConfigsTable.channel, "influencer"),
    ));
  const activations = (channel?.settings as Record<string, unknown> ?? {}) as { activations?: Array<{ influencerId: number; status: string; briefSent: boolean; visitsAttributed: number }> };
  const activationMap = new Map(
    (activations.activations ?? []).map((a: { influencerId: number; status: string; briefSent: boolean; visitsAttributed: number }) => [a.influencerId, a])
  );
  res.json(influencers.map(inf => ({
    ...inf,
    activationStatus: activationMap.get(inf.id)?.status ?? "idle",
    briefSent: activationMap.get(inf.id)?.briefSent ?? false,
    visitsAttributed: activationMap.get(inf.id)?.visitsAttributed ?? 0,
  })));
});

router.post("/traffic-campaigns/:id/influencer-activations/:influencerId", ...requireTraffic, async (req, res) => {
  const user = await getDbUser(getAuth(req).userId!);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { action } = req.body; // send_brief | mark_active | mark_completed
  const influencerId = Number(req.params.influencerId);
  const [channel] = await db.select().from(campaignChannelConfigsTable)
    .where(and(
      eq(campaignChannelConfigsTable.campaignId, Number(req.params.id)),
      eq(campaignChannelConfigsTable.userId, user.id),
      eq(campaignChannelConfigsTable.channel, "influencer"),
    ));
  if (!channel) { res.status(404).json({ error: "Influencer channel config not found" }); return; }
  const existing = (channel.settings as Record<string, unknown>) as { activations?: Array<{ influencerId: number; status: string; briefSent: boolean; visitsAttributed: number }> };
  const activations = existing.activations ?? [];
  const idx = activations.findIndex(a => a.influencerId === influencerId);
  const current = idx >= 0 ? activations[idx] : { influencerId, status: "idle", briefSent: false, visitsAttributed: 0 };
  const updated = {
    ...current,
    status: action === "send_brief" ? "briefed" : action === "mark_active" ? "active" : action === "mark_completed" ? "completed" : current.status,
    briefSent: action === "send_brief" ? true : current.briefSent,
  };
  if (idx >= 0) activations[idx] = updated; else activations.push(updated);
  await db.update(campaignChannelConfigsTable)
    .set({ settings: { ...existing, activations }, updatedAt: new Date() })
    .where(eq(campaignChannelConfigsTable.id, channel.id));
  res.json(updated);
});

// ─── Traffic events ───────────────────────────────────────────────────────────

router.post("/traffic-campaigns/:id/events", ...requireTraffic, async (req, res) => {
  const user = await getDbUser(getAuth(req).userId!);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  // Ownership check — prevent IDOR on cross-tenant metric manipulation
  const [campaign] = await db.select().from(trafficCampaignsTable)
    .where(and(eq(trafficCampaignsTable.id, Number(req.params.id)), eq(trafficCampaignsTable.userId, user.id)));
  if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }
  const { channel, eventType, trackedLinkSlug, referrer, region, metadata } = req.body;
  const [event] = await db.insert(trafficEventsTable).values({
    campaignId: campaign.id,
    userId: user.id,
    channel: channel ?? "organic_social",
    eventType: eventType ?? "click",
    trackedLinkSlug,
    referrer,
    region,
    metadata: metadata ?? {},
  }).returning();
  // Increment channel visits (scoped by userId)
  await db.update(campaignChannelConfigsTable)
    .set({ visits: sql`visits + 1`, updatedAt: new Date() })
    .where(and(
      eq(campaignChannelConfigsTable.campaignId, campaign.id),
      eq(campaignChannelConfigsTable.userId, user.id),
      eq(campaignChannelConfigsTable.channel, channel ?? "organic_social"),
    ));
  // Increment campaign total (already scoped to owned campaign)
  await db.update(trafficCampaignsTable)
    .set({ totalVisits: sql`total_visits + 1`, updatedAt: new Date() })
    .where(and(eq(trafficCampaignsTable.id, campaign.id), eq(trafficCampaignsTable.userId, user.id)));
  res.status(201).json(event);
});

// ─── Growth Snapshots ─────────────────────────────────────────────────────────

router.get("/growth-snapshots", ...requireTraffic, async (req, res) => {
  const user = await getDbUser(getAuth(req).userId!);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { platformAccountId } = req.query;
  const conditions = [eq(growthSnapshotsTable.userId, user.id)];
  if (platformAccountId) conditions.push(eq(growthSnapshotsTable.platformAccountId, Number(platformAccountId)));
  const snapshots = await db.select().from(growthSnapshotsTable)
    .where(and(...conditions))
    .orderBy(desc(growthSnapshotsTable.snapshotDate))
    .limit(90);
  res.json(snapshots);
});

router.post("/growth-snapshots", ...requireTraffic, async (req, res) => {
  const user = await getDbUser(getAuth(req).userId!);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { platformAccountId, platform, handle, followerCount, followerGrowthRate, reachCount, reachGrowthRate, engagementVelocity, healthScore, alertThresholdRate, alertEnabled } = req.body;
  if (!platformAccountId || !platform || !handle) { res.status(400).json({ error: "platformAccountId, platform and handle required" }); return; }
  const [snap] = await db.insert(growthSnapshotsTable).values({
    userId: user.id,
    platformAccountId: Number(platformAccountId),
    platform,
    handle,
    followerCount: followerCount ?? 0,
    followerGrowthRate: followerGrowthRate ?? "0",
    reachCount: reachCount ?? 0,
    reachGrowthRate: reachGrowthRate ?? "0",
    engagementVelocity: engagementVelocity ?? "0",
    healthScore: healthScore ?? 50,
    alertThresholdRate: alertThresholdRate ?? "0",
    alertEnabled: alertEnabled ?? false,
  }).returning();
  res.status(201).json(snap);
});

router.patch("/growth-snapshots/:id/alert", ...requireTraffic, async (req, res) => {
  const user = await getDbUser(getAuth(req).userId!);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { alertEnabled, alertThresholdRate } = req.body;
  const [updated] = await db.update(growthSnapshotsTable)
    .set({
      ...(alertEnabled !== undefined && { alertEnabled }),
      ...(alertThresholdRate !== undefined && { alertThresholdRate }),
    })
    .where(and(eq(growthSnapshotsTable.id, Number(req.params.id)), eq(growthSnapshotsTable.userId, user.id)))
    .returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(updated);
});

// ─── Hook Library ─────────────────────────────────────────────────────────────

router.get("/hook-library", ...requireTraffic, async (req, res) => {
  const user = await getDbUser(getAuth(req).userId!);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { platform, niche, format, q } = req.query;
  // Seed curated hooks if empty
  const count = await db.$count(hookLibraryEntriesTable);
  if (count === 0) {
    const weekNumber = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000));
    await db.insert(hookLibraryEntriesTable).values(
      CURATED_HOOKS.map(h => ({ ...h, curated: true, weekNumber }))
    );
  }
  // Build filters — always scope to curated entries OR own entries (tenant isolation)
  const tenantFilter = sql`(${hookLibraryEntriesTable.curated} = true OR ${hookLibraryEntriesTable.userId} = ${user.id})`;
  const conditions: Parameters<typeof and>[0][] = [tenantFilter];
  if (platform && platform !== "all") conditions.push(eq(hookLibraryEntriesTable.platform, String(platform)));
  if (niche) conditions.push(eq(hookLibraryEntriesTable.niche, String(niche)));
  if (format) conditions.push(eq(hookLibraryEntriesTable.format, String(format)));
  const hooks = await db.select().from(hookLibraryEntriesTable)
    .where(and(...(conditions as Parameters<typeof and>)))
    .orderBy(desc(hookLibraryEntriesTable.likeCount), desc(hookLibraryEntriesTable.createdAt))
    .limit(100);
  // Client-side text filter for search
  const filtered = q
    ? hooks.filter(h => h.title.toLowerCase().includes(String(q).toLowerCase()) || h.hookText.toLowerCase().includes(String(q).toLowerCase()))
    : hooks;
  res.json(filtered);
});

router.post("/hook-library", ...requireTraffic, async (req, res) => {
  const user = await getDbUser(getAuth(req).userId!);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { title, hookText, platform, niche, format, tags } = req.body;
  if (!title || !hookText) { res.status(400).json({ error: "title and hookText required" }); return; }
  const [entry] = await db.insert(hookLibraryEntriesTable).values({
    userId: user.id,
    title,
    hookText,
    platform: platform ?? "all",
    niche: niche ?? "general",
    format: format ?? "caption",
    tags: tags ?? [],
    curated: false,
  }).returning();
  res.status(201).json(entry);
});

router.post("/hook-library/:id/like", ...requireTraffic, async (req, res) => {
  const user = await getDbUser(getAuth(req).userId!);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  // Only allow like on curated hooks or own hooks (prevents cross-tenant mutation)
  const [updated] = await db.update(hookLibraryEntriesTable)
    .set({ likeCount: sql`like_count + 1`, updatedAt: new Date() })
    .where(and(
      eq(hookLibraryEntriesTable.id, Number(req.params.id)),
      sql`(${hookLibraryEntriesTable.curated} = true OR ${hookLibraryEntriesTable.userId} = ${user.id})`,
    ))
    .returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(updated);
});

router.post("/hook-library/:id/use", ...requireTraffic, async (req, res) => {
  const user = await getDbUser(getAuth(req).userId!);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  // Only allow use on curated hooks or own hooks (prevents cross-tenant mutation)
  const [updated] = await db.update(hookLibraryEntriesTable)
    .set({ useCount: sql`use_count + 1`, updatedAt: new Date() })
    .where(and(
      eq(hookLibraryEntriesTable.id, Number(req.params.id)),
      sql`(${hookLibraryEntriesTable.curated} = true OR ${hookLibraryEntriesTable.userId} = ${user.id})`,
    ))
    .returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(updated);
});

// ─── SEO Content Jobs ─────────────────────────────────────────────────────────

router.get("/seo-content-jobs", ...requireTraffic, async (req, res) => {
  const user = await getDbUser(getAuth(req).userId!);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const pieces = await db.select().from(seoContentPiecesTable)
    .where(eq(seoContentPiecesTable.userId, user.id))
    .orderBy(desc(seoContentPiecesTable.createdAt))
    .limit(50);
  res.json(pieces);
});

router.post("/seo-content-jobs", ...requireTraffic, async (req, res) => {
  const user = await getDbUser(getAuth(req).userId!);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { topic, contentType, targetKeywords, region } = req.body;
  if (!topic) { res.status(400).json({ error: "topic required" }); return; }
  const [piece] = await db.insert(seoContentPiecesTable).values({
    userId: user.id,
    topic,
    contentType: contentType ?? "blog",
    targetKeywords: targetKeywords ?? [],
    region: region ?? "NG",
    status: "generating",
  }).returning();

  // Generate SEO content asynchronously (fire-and-forget)
  setImmediate(async () => {
    try {
      const kws = (targetKeywords ?? []).slice(0, 5).join(", ") || topic;
      const regionLabel = region === "NG" ? "Nigeria" : region === "GH" ? "Ghana" : region === "ZA" ? "South Africa" : "Africa";
      const isYouTube = contentType === "youtube_description";
      const isThread = contentType === "thread";

      let body: string;
      let title: string;
      let metaDescription: string;

      if (isYouTube) {
        title = `${topic} — Everything You Need to Know (${regionLabel} Edition)`;
        body = `In this video, we break down everything about ${topic} for ${regionLabel}n creators and entrepreneurs.\n\n🎯 What you'll learn:\n- The fundamentals of ${kws}\n- Real examples from the ${regionLabel}n market\n- Actionable steps you can start TODAY\n\nThis is the complete guide for ${regionLabel}n audiences searching for "${topic}".\n\n⏱️ Chapters:\n00:00 — Introduction\n02:30 — Understanding ${topic}\n07:00 — ${regionLabel} context and examples\n12:00 — Step-by-step implementation\n18:00 — Common mistakes to avoid\n22:00 — Conclusion and next steps\n\n🔗 Resources mentioned:\n• Area Fada OS — areafadaos.com\n\n📌 Subscribe for weekly ${regionLabel}n creator tips!\n\n#${topic.replace(/\s+/g, "")} #${regionLabel}CreatorEconomy #AreaFada`;
        metaDescription = `Complete guide to ${topic} for ${regionLabel}n creators. Learn ${kws} with real examples.`;
      } else if (isThread) {
        title = `${topic} — A Thread for ${regionLabel}n Creators`;
        body = `🧵 THREAD: Everything you need to know about ${topic} as a ${regionLabel}n creator.\n\n1/ ${topic} is one of the most searched topics in ${regionLabel} right now. Here's why it matters for YOUR brand.\n\n2/ The fundamentals: ${kws}. Most people get this wrong because they copy Western creators without adapting for our market.\n\n3/ Here's what works in ${regionLabel}: [Localised examples and data points specific to ${regionLabel}n audience behaviour]\n\n4/ The key mistake: ignoring local SEO. Optimise for "${topic} in ${regionLabel}" and related terms.\n\n5/ Action steps:\n✅ Research "${kws}" on local forums\n✅ Create content in Pidgin + English\n✅ Collaborate with micro-influencers\n\n6/ Bottom line: ${topic} is an opportunity most ${regionLabel}n creators are sleeping on. Start today.\n\n— End of thread. RT to help a creator 🙏`;
        metaDescription = `Thread on ${topic} for ${regionLabel}n creators. Practical steps and local insights.`;
      } else {
        title = `${topic}: The Complete Guide for ${regionLabel}n Creators (${new Date().getFullYear()})`;
        body = `# ${title}\n\nIf you're a creator or entrepreneur in ${regionLabel} searching for the best approach to ${topic}, you've come to the right place. This guide covers everything — from the basics to advanced strategies tailored for the ${regionLabel}n market.\n\n## What is ${topic}?\n\n${topic} refers to the strategies and tools that ${regionLabel}n creators use to grow their audience and monetise their content. Understanding ${kws} is essential for any serious creator in Africa's digital economy.\n\n## Why ${topic} Matters in ${regionLabel}\n\nWith over 100 million internet users and a rapidly growing creator economy, ${regionLabel} represents one of Africa's largest opportunities. Brands are actively searching for creators who understand ${topic} and can deliver results.\n\n## Getting Started with ${topic}\n\n### Step 1: Research your audience\nBefore diving into ${topic}, understand who you're speaking to. Nigerian audiences respond to authenticity, local references, and Pidgin English mixed with professional language.\n\n### Step 2: Optimise for ${regionLabel}n search queries\nTarget keywords like "${kws}" in your content. Use Google Trends filtered to ${regionLabel} to validate demand.\n\n### Step 3: Build your content calendar\nConsistency is key. Post at optimal times for your audience — typically 7–9am and 7–10pm WAT.\n\n### Step 4: Measure and iterate\nTrack which ${topic}-related content performs best and double down.\n\n## Conclusion\n\n${topic} is not just a trend — it's a sustainable strategy for ${regionLabel}n creator growth. Start implementing these steps today and watch your audience grow.\n\n*Published by Area Fada OS — the social media operating system for Nigerian creators.*`;
        metaDescription = `Complete guide to ${topic} for ${regionLabel}n creators. Learn ${kws} with practical steps and local examples. Updated ${new Date().getFullYear()}.`;
      }

      await db.update(seoContentPiecesTable)
        .set({ title, body, metaDescription, status: "done", updatedAt: new Date() })
        .where(eq(seoContentPiecesTable.id, piece.id));
    } catch (_err) {
      await db.update(seoContentPiecesTable)
        .set({ status: "failed", updatedAt: new Date() })
        .where(eq(seoContentPiecesTable.id, piece.id));
    }
  });

  res.status(201).json(piece);
});

router.post("/seo-content-jobs/:id/publish-to-calendar", ...requireTraffic, async (req, res) => {
  const user = await getDbUser(getAuth(req).userId!);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const [piece] = await db.select().from(seoContentPiecesTable)
    .where(and(eq(seoContentPiecesTable.id, Number(req.params.id)), eq(seoContentPiecesTable.userId, user.id)));
  if (!piece) { res.status(404).json({ error: "Not found" }); return; }
  if (piece.status !== "done") { res.status(400).json({ error: "Content generation not complete" }); return; }
  const { scheduledAt, platform } = req.body;
  const [post] = await db.insert(postsTable).values({
    userId: user.id,
    platforms: [platform ?? "instagram"],
    caption: `${piece.title ?? piece.topic}\n\n${(piece.body ?? "").substring(0, 2000)}`.substring(0, 2200),
    status: "draft",
    scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
  }).returning();
  await db.update(seoContentPiecesTable)
    .set({ publishedToCalendar: true, scheduledPostId: post.id, updatedAt: new Date() })
    .where(eq(seoContentPiecesTable.id, piece.id));
  res.json({ post, piece: { ...piece, publishedToCalendar: true, scheduledPostId: post.id } });
});

// ─── Content velocity recommender (AI-powered) ────────────────────────────────

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

router.get("/traffic/content-velocity", ...requireTraffic, async (req, res) => {
  const user = await getDbUser(getAuth(req).userId!);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  // Collect last 30 days of posts for analysis
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const recentPosts = await db.select().from(postsTable)
    .where(and(eq(postsTable.userId, user.id), gte(postsTable.scheduledAt, since)))
    .orderBy(desc(postsTable.scheduledAt))
    .limit(200);

  const totalPosts = recentPosts.length;
  const overallPostsPerWeek = Math.round((totalPosts / 30) * 7 * 10) / 10;

  // Build per-platform summary for Claude
  const byPlatform: Record<string, { count: number; captions: string[] }> = {};
  for (const p of recentPosts) {
    for (const plat of (p.platforms ?? [])) {
      if (!byPlatform[plat]) byPlatform[plat] = { count: 0, captions: [] };
      byPlatform[plat].count++;
      if (byPlatform[plat].captions.length < 5 && p.caption) {
        byPlatform[plat].captions.push(p.caption.substring(0, 120));
      }
    }
  }

  // Fall back to empty platform set hint if no posts yet
  const platformSummary = Object.keys(byPlatform).length > 0
    ? Object.entries(byPlatform).map(([plat, d]) => {
        const perWeek = Math.round((d.count / 30) * 7 * 10) / 10;
        return `- ${plat}: ${d.count} posts in 30 days (${perWeek}/week). Top captions: ${d.captions.map(c => `"${c}"`).join("; ") || "none"}`;
      }).join("\n")
    : "No posts found in the last 30 days on any platform.";

  let aiAnalysis: { recommendations: Array<{ platform: string; currentPostsPerWeek: number; recommendedPostsPerWeek: number; contentMix: { educational: number; entertainment: number; promotional: number }; insight: string }>; overallInsight: string } | null = null;

  try {
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      messages: [{
        role: "user",
        content: `You are a Nigerian creator growth strategist. Analyse this creator's recent posting data and return a JSON object with actionable content velocity recommendations optimised for Nigerian and West African audiences.

POSTING DATA (last 30 days):
${platformSummary}

Return ONLY valid JSON in this exact shape — no markdown, no explanation:
{
  "overallInsight": "2-3 sentence overall assessment of the creator's posting strategy",
  "recommendations": [
    {
      "platform": "instagram",
      "currentPostsPerWeek": 3.5,
      "recommendedPostsPerWeek": 7,
      "contentMix": { "educational": 30, "entertainment": 50, "promotional": 20 },
      "insight": "Specific actionable advice for this platform, referencing Nigerian audiences and creator context. Mention top-performing content types for the Nigerian market."
    }
  ]
}

Rules:
- Include a recommendation for every platform in the posting data, plus any high-priority platforms they are missing (instagram, tiktok, youtube, twitter).
- contentMix values must sum to 100.
- Insights must be specific, Nigerian-market-aware, and mention 1-2 concrete tactics (e.g. "Reel hooks featuring Lagos street culture", "Gospel/motivational content for Sunday morning posts").
- recommendedPostsPerWeek should reflect Nigerian creator best practices for each platform.`
      }],
    });

    const text = msg.content[0].type === "text" ? msg.content[0].text.trim() : "";
    const json = text.startsWith("{") ? text : text.replace(/```json\n?|```/g, "").trim();
    aiAnalysis = JSON.parse(json);
  } catch (err) {
    console.error("Claude content velocity error:", err);
    // Graceful fallback to static recommendations
  }

  if (aiAnalysis) {
    res.json({
      analysedPeriodDays: 30,
      totalPostsAnalysed: totalPosts,
      overallPostsPerWeek,
      overallInsight: aiAnalysis.overallInsight,
      recommendations: aiAnalysis.recommendations,
      generatedAt: new Date().toISOString(),
      aiPowered: true,
    });
    return;
  }

  // Static fallback if Claude fails
  const PLATFORM_TARGETS: Record<string, { target: number; mix: { educational: number; entertainment: number; promotional: number }; tip: string }> = {
    instagram: { target: 7, mix: { educational: 30, entertainment: 50, promotional: 20 }, tip: "Post 1 Reel, 1 carousel, and 1 story daily for compound growth. Lagos lifestyle hooks perform strongly." },
    tiktok: { target: 14, mix: { educational: 20, entertainment: 70, promotional: 10 }, tip: "TikTok rewards volume. Aim for 2+ posts/day — open with a bold Naija culture hook in the first second." },
    twitter: { target: 21, mix: { educational: 40, entertainment: 40, promotional: 20 }, tip: "3 tweets per day builds authority. Mix threads, hot takes, and retweets of trending Nigerian conversations." },
    youtube: { target: 2, mix: { educational: 60, entertainment: 30, promotional: 10 }, tip: "2 videos per week is optimal. Optimise titles for Nigerian search queries (e.g. 'how to make money in Nigeria 2026')." },
    facebook: { target: 5, mix: { educational: 35, entertainment: 45, promotional: 20 }, tip: "Facebook Groups drive the most reach for Nigerian audiences. Post in your community daily." },
  };
  const platforms = Object.keys(byPlatform).length > 0 ? Object.keys(byPlatform) : Object.keys(PLATFORM_TARGETS);
  const recommendations = platforms.map(platform => {
    const target = PLATFORM_TARGETS[platform] ?? { target: 5, mix: { educational: 33, entertainment: 34, promotional: 33 }, tip: "Aim for daily posting for best results." };
    const currentPerWeek = byPlatform[platform] ? Math.round((byPlatform[platform].count / 30) * 7 * 10) / 10 : 0;
    return {
      platform,
      currentPostsPerWeek: currentPerWeek,
      recommendedPostsPerWeek: target.target,
      contentMix: target.mix,
      insight: currentPerWeek < target.target * 0.5
        ? `⚠️ Underposting on ${platform} — ${currentPerWeek}/week vs recommended ${target.target}/week. ${target.tip}`
        : currentPerWeek > target.target * 1.5
        ? `⚡ Strong volume on ${platform}! Ensure quality stays high. ${target.tip}`
        : `✅ Good ${platform} cadence. ${target.tip}`,
    };
  });
  res.json({
    analysedPeriodDays: 30,
    totalPostsAnalysed: totalPosts,
    overallPostsPerWeek,
    recommendations,
    generatedAt: new Date().toISOString(),
    aiPowered: false,
  });
});

export default router;
