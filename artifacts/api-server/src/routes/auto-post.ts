import { Router } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "@workspace/db";
import {
  postDraftsTable,
  publishJobsTable,
  accountGroupsTable,
  accountGroupMembersTable,
  approvalRequestsTable,
  complianceFlagsTable,
  platformAccountsTable,
  hashtagCacheTable,
  usersTable,
  activityLogTable,
} from "@workspace/db";
import { eq, desc, and, lte, inArray } from "drizzle-orm";
import { requireAuth } from "./users";
import { requireTier } from "../middlewares/tierGuard";

const router = Router();
const requirePost = [requireAuth, requireTier("brand")];
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function getDbUser(clerkId: string) {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  return user ?? null;
}

const PLATFORM_SPECS: Record<string, { maxChars: number; style: string; tone: string }> = {
  x: { maxChars: 280, style: "sharp and opinionated, one strong statement, 1-2 hashtags max", tone: "punchy" },
  instagram: { maxChars: 2200, style: "storytelling with line breaks, 3-5 hashtags at end, emojis for visual rhythm", tone: "narrative" },
  facebook: { maxChars: 500, style: "conversational, community-driven, question or CTA, warm and engaging", tone: "community" },
  tiktok: { maxChars: 300, style: "punchy hook in first line, trending Pidgin energy, 2-3 hashtags inline, Gen Z flavor", tone: "pidgin" },
  youtube: { maxChars: 1000, style: "SEO-friendly description, clear value proposition, timestamps, call to action", tone: "formal" },
  threads: { maxChars: 500, style: "casual conversational, thought-provoking, no hashtags, thread-starter energy", tone: "casual" },
};

const OPTIMAL_TIMES: Record<string, { slots: string[]; timezone: string; explanation: string }> = {
  instagram: { slots: ["08:00", "12:00", "19:00"], timezone: "WAT", explanation: "Morning commute, lunch break, evening scroll — peak WAT engagement windows" },
  tiktok: { slots: ["07:00", "15:00", "21:00"], timezone: "WAT", explanation: "Pre-work, after-school, prime-time — Nigeria Gen Z TikTok peaks" },
  x: { slots: ["09:00", "13:00", "20:00"], timezone: "WAT", explanation: "Office hours and evening commentary — Nigerian Twitter peaks" },
  facebook: { slots: ["09:00", "13:00", "18:00"], timezone: "WAT", explanation: "Facebook Nigeria skews older — morning, lunch, and family-time windows" },
  youtube: { slots: ["15:00", "19:00"], timezone: "WAT", explanation: "After-school / after-work — longest session times in Nigeria" },
  threads: { slots: ["10:00", "14:00", "20:00"], timezone: "WAT", explanation: "Threads Nigeria follows X patterns with slight evening shift" },
};

const NIGERIA_HASHTAG_POOLS: Record<string, Record<string, string[]>> = {
  instagram: {
    NG: ["#NigeriaTwitter", "#NaijaCreators", "#AreaFada", "#CharlyBoy", "#LagosLife", "#AfricaRising", "#999Book"],
    GH: ["#GhanaTwitter", "#GhanaVibes", "#AfricaCreators", "#AkwaabaGhana"],
    diaspora: ["#NaijaInUK", "#NaijaInUSA", "#AfricanDiaspora", "#NigerianInLondon", "#AfricanCreatives"],
    music: ["#NaijaMusic", "#AfrobeatsNG", "#AfricanMusic", "#MadeinNigeria"],
    culture: ["#NigerianCulture", "#YorubaTwitter", "#IgboTwitter", "#HausaTwitter"],
  },
  tiktok: {
    NG: ["#NaijaTikTok", "#AfricaTikTok", "#PidginTikTok", "#NigeriaVibes", "#LagosLife"],
    GH: ["#GhanaTikTok", "#AfricaVibes", "#GhanaTwitter"],
    diaspora: ["#AfricanDiaspora", "#BlackCreators", "#AfricanTikTok"],
    music: ["#Afrobeats", "#Amapiano", "#NaijaMusic", "#AfroPop"],
    culture: ["#NigerianFood", "#AfricanDance", "#NaijaFashion"],
  },
  x: {
    NG: ["#Nigeria", "#NigerianTwitter", "#AbujaTwitter", "#LagosTwitter", "#CharlyBoy"],
    GH: ["#Ghana", "#GhanaTwitter", "#AccraTwitter"],
    diaspora: ["#Naija", "#AfricanDiaspora", "#NigerianInUK"],
    music: ["#Afrobeats", "#NaijaMusic", "#WizkidFC"],
    culture: ["#YorubaTwitter", "#IgboTwitter", "#NigerianPolitics"],
  },
  facebook: {
    NG: ["#Nigeria", "#NaijaFacebook", "#LagosNigeria", "#AbujaLife", "#CharlyBoy"],
    GH: ["#Ghana", "#AccraGhana"],
    diaspora: ["#AfricanDiaspora", "#NaijasAbroad"],
    music: ["#Afrobeats", "#NaijaMusic", "#AfricanMusic"],
    culture: ["#NigerianCulture", "#AfricanCulture"],
  },
  youtube: {
    NG: ["#NigeriaYouTube", "#NaijaVlog", "#NigerianContent", "#LagosVlog"],
    GH: ["#GhanaYouTube", "#GhanaVlog"],
    diaspora: ["#AfricanDiaspora", "#NaijaAbroad"],
    music: ["#AfrobeatsTV", "#NaijaMusicVideo"],
    culture: ["#NigerianCuisine", "#AfricanLifestyle"],
  },
};

// ─── Demo seed ─────────────────────────────────────────────────────────────────
async function maybeAutoPostSeed(userId: number) {
  const existing = await db.select({ id: accountGroupsTable.id })
    .from(accountGroupsTable).where(eq(accountGroupsTable.userId, userId)).limit(1);
  if (existing.length > 0) return;

  const [group] = await db.insert(accountGroupsTable).values({
    userId, name: "All Charly Boy Accounts", description: "Primary publishing group across all Area Fada platforms", color: "#e11d48",
  }).returning();

  await db.insert(accountGroupMembersTable).values([
    { groupId: group.id, userId, platform: "instagram", handle: "@areafada_abj", displayName: "CharlyBoy IG" },
    { groupId: group.id, userId, platform: "x", handle: "@AreaFada1", displayName: "Area Fada X" },
    { groupId: group.id, userId, platform: "tiktok", handle: "@charlyboyofficial", displayName: "CharlyBoy TikTok" },
    { groupId: group.id, userId, platform: "youtube", handle: "@AreaFadaTV", displayName: "CharlyBoy YT" },
  ]);

  const [draft] = await db.insert(postDraftsTable).values({
    userId,
    title: "Area Fada Newsletter Launch",
    sourceCaption: "Big announcement! Area Fada's exclusive newsletter drops this week. First 999 subscribers get lifetime access to premium content, behind-the-scenes stories, and direct access to the Fada himself. This is more than a newsletter — it's a movement.",
    selectedPlatforms: ["instagram", "x", "tiktok", "facebook"],
    platformVariants: {
      x: "🚨 BREAKING: Area Fada newsletter is LIVE. First 999 subscribers get lifetime premium access. You snooze, you lose. Sign up now. #AreaFada #999",
      instagram: "Big announcement, my people 🔥\n\nArea Fada's exclusive newsletter drops this WEEK.\n\nFirst 999 subscribers lock in:\n✅ Lifetime premium access\n✅ Behind-the-scenes content\n✅ Direct access to me\n\nThis isn't just a newsletter. This is the movement.\n\nLink in bio 👆\n\n#AreaFada #CharlyBoy #NigeriaTwitter #NaijaCreators #999Book",
      facebook: "My people, big news! Area Fada's newsletter is launching this week. The first 999 subscribers will get lifetime access to premium content and behind-the-scenes stories. Are you joining the movement? Drop a 🙋 in the comments!",
      tiktok: "Omo see opportunity o! 🔥 Area Fada newsletter don land. First 999 people wey sign up go get lifetime access — FREE! No dull yourself. Link for bio. #AreaFada #NaijaTikTok #CharlyBoy",
    },
    platformHashtags: {
      instagram: ["#AreaFada", "#CharlyBoy", "#NigeriaTwitter", "#NaijaCreators", "#999Book"],
      x: ["#AreaFada", "#999"],
      tiktok: ["#AreaFada", "#NaijaTikTok", "#CharlyBoy"],
      facebook: ["#AreaFada", "#CharlyBoy"],
    },
    status: "draft",
    complianceChecked: true,
    complianceScore: 98,
  }).returning();

  await db.insert(publishJobsTable).values([
    { userId, draftId: draft.id, platform: "instagram", caption: "Big announcement, my people...", status: "published", attemptCount: 1, publishedAt: new Date(Date.now() - 3600000) },
    { userId, draftId: draft.id, platform: "x", caption: "🚨 BREAKING: Area Fada newsletter is LIVE...", status: "failed", attemptCount: 2, errorMessage: "Rate limit exceeded", lastAttemptAt: new Date(Date.now() - 1800000) },
    { userId, draftId: draft.id, platform: "tiktok", caption: "Omo see opportunity o!...", status: "pending", attemptCount: 0 },
    { userId, draftId: draft.id, platform: "facebook", caption: "My people, big news!...", status: "published", attemptCount: 1, publishedAt: new Date(Date.now() - 3200000) },
  ]);

  const [draft2] = await db.insert(postDraftsTable).values({
    userId,
    title: "Monday Motivation Drop",
    sourceCaption: "Every week, Nigeria wakes up and hustles. Area Fada sees you. Your grind is your sermon.",
    selectedPlatforms: ["instagram", "x"],
    status: "pending_approval",
    approvalRequired: true,
    complianceChecked: false,
  }).returning();

  await db.insert(approvalRequestsTable).values({
    userId,
    draftId: draft2.id,
    requestedByUserId: userId,
    status: "pending",
    notificationLog: [{ type: "whatsapp", sentAt: new Date().toISOString(), channel: "whatsapp", recipient: "+234-XXX-XXXX" }],
  });
}

// ─── Post Drafts ───────────────────────────────────────────────────────────────
router.get("/auto-post/drafts", ...requirePost, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    await maybeAutoPostSeed(user.id);
    const drafts = await db.select().from(postDraftsTable)
      .where(eq(postDraftsTable.userId, user.id))
      .orderBy(desc(postDraftsTable.updatedAt));
    res.json(drafts);
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed to fetch drafts" }); }
});

router.post("/auto-post/drafts", ...requirePost, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    const { title, sourceCaption, mediaUrls, selectedPlatforms, selectedAccountIds, selectedGroupId, scheduledAt, approvalRequired } = req.body;
    if (!sourceCaption) { res.status(400).json({ error: "sourceCaption required" }); return; }
    const [draft] = await db.insert(postDraftsTable).values({
      userId: user.id, title, sourceCaption,
      mediaUrls: mediaUrls ?? [],
      selectedPlatforms: selectedPlatforms ?? [],
      selectedAccountIds: selectedAccountIds ?? [],
      selectedGroupId: selectedGroupId ?? null,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
      approvalRequired: approvalRequired ?? false,
    }).returning();
    res.status(201).json(draft);
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed to create draft" }); }
});

router.get("/auto-post/drafts/:id", ...requirePost, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    const [draft] = await db.select().from(postDraftsTable)
      .where(and(eq(postDraftsTable.id, Number(req.params.id)), eq(postDraftsTable.userId, user.id)));
    if (!draft) { res.status(404).json({ error: "Draft not found" }); return; }
    const jobs = await db.select().from(publishJobsTable)
      .where(and(eq(publishJobsTable.draftId, draft.id), eq(publishJobsTable.userId, user.id)));
    res.json({ draft, jobs });
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed to fetch draft" }); }
});

router.patch("/auto-post/drafts/:id", ...requirePost, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    const { title, sourceCaption, mediaUrls, selectedPlatforms, selectedAccountIds, platformVariants, platformHashtags, scheduledAt, approvalRequired, status } = req.body;
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (title !== undefined) patch.title = title;
    if (sourceCaption !== undefined) patch.sourceCaption = sourceCaption;
    if (mediaUrls !== undefined) patch.mediaUrls = mediaUrls;
    if (selectedPlatforms !== undefined) patch.selectedPlatforms = selectedPlatforms;
    if (selectedAccountIds !== undefined) patch.selectedAccountIds = selectedAccountIds;
    if (platformVariants !== undefined) patch.platformVariants = platformVariants;
    if (platformHashtags !== undefined) patch.platformHashtags = platformHashtags;
    if (scheduledAt !== undefined) patch.scheduledAt = new Date(scheduledAt);
    if (approvalRequired !== undefined) patch.approvalRequired = approvalRequired;
    if (status !== undefined) patch.status = status;
    const [updated] = await db.update(postDraftsTable).set(patch)
      .where(and(eq(postDraftsTable.id, Number(req.params.id)), eq(postDraftsTable.userId, user.id)))
      .returning();
    if (!updated) { res.status(404).json({ error: "Draft not found" }); return; }
    res.json(updated);
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed to update draft" }); }
});

router.delete("/auto-post/drafts/:id", ...requirePost, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    const [deleted] = await db.delete(postDraftsTable)
      .where(and(eq(postDraftsTable.id, Number(req.params.id)), eq(postDraftsTable.userId, user.id)))
      .returning();
    if (!deleted) { res.status(404).json({ error: "Draft not found" }); return; }
    await db.delete(publishJobsTable).where(and(eq(publishJobsTable.draftId, deleted.id), eq(publishJobsTable.userId, user.id)));
    res.status(204).end();
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed to delete draft" }); }
});

// ─── AI Caption Variant Generator ─────────────────────────────────────────────
router.post("/auto-post/drafts/:id/generate-variants", ...requirePost, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    const [draft] = await db.select().from(postDraftsTable)
      .where(and(eq(postDraftsTable.id, Number(req.params.id)), eq(postDraftsTable.userId, user.id)));
    if (!draft) { res.status(404).json({ error: "Draft not found" }); return; }
    const { platforms = ["x", "instagram", "facebook", "tiktok"] } = req.body;

    const specList = platforms.map((p: string) => {
      const spec = PLATFORM_SPECS[p] ?? { maxChars: 500, style: "engaging social post", tone: "conversational" };
      return `- ${p.toUpperCase()} (max ${spec.maxChars} chars, tone: ${spec.tone}): ${spec.style}`;
    }).join("\n");

    const prompt = `You are Charly Boy (Area Fada), Nigeria's most iconic cultural provocateur. Given a source caption, generate platform-specific variants.

SOURCE CAPTION:
${draft.sourceCaption}

Generate a variant for each platform below. Return ONLY valid JSON with this exact shape:
{
  "variants": {
    "<platform>": {
      "caption": "<platform-optimized caption>",
      "hashtags": ["<tag1>", "<tag2>"],
      "charCount": <number>
    }
  }
}

Platform specs:
${specList}

Rules:
- X: max 280 chars TOTAL including hashtags. Be sharp and bold.
- Instagram: narrative, emojis, hashtags at the end.
- Facebook: conversational, end with a question or CTA.
- TikTok: Nigerian Pidgin energy, punchy hook first line.
- Preserve the core message but adapt tone/length per platform.`;

    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 1200,
      messages: [{ role: "user", content: prompt }],
    });

    const raw = (response.content[0] as { type: string; text: string }).text.trim();
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { variants: {} };

    const platformVariants: Record<string, string> = {};
    const platformHashtags: Record<string, string[]> = {};
    for (const [platform, data] of Object.entries(parsed.variants as Record<string, { caption: string; hashtags: string[] }>)) {
      platformVariants[platform] = data.caption;
      platformHashtags[platform] = data.hashtags ?? [];
    }

    await db.update(postDraftsTable).set({ platformVariants, platformHashtags, updatedAt: new Date() })
      .where(eq(postDraftsTable.id, draft.id));

    res.json({ variants: parsed.variants, platformVariants, platformHashtags });
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed to generate variants" }); }
});

// ─── Compliance Check ─────────────────────────────────────────────────────────
router.post("/auto-post/drafts/:id/compliance-check", ...requirePost, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    const [draft] = await db.select().from(postDraftsTable)
      .where(and(eq(postDraftsTable.id, Number(req.params.id)), eq(postDraftsTable.userId, user.id)));
    if (!draft) { res.status(404).json({ error: "Draft not found" }); return; }

    const prompt = `You are a Nigerian digital advertising compliance officer. Check this social media caption for compliance issues.

CAPTION:
${draft.sourceCaption}

Check against:
1. APCON (Advertising Practitioners Council of Nigeria) guidelines — misleading claims, endorsement rules, alcohol/tobacco rules
2. Platform community standards risks — hate speech, nudity/explicit content, misinformation
3. Political advertising disclosure requirements — any political content needs "#PaidPromotion" or similar

Return ONLY valid JSON:
{
  "overallScore": <0-100, 100 = fully compliant>,
  "flags": [
    {
      "type": "<apcon|platform|political|disclosure>",
      "severity": "<low|medium|high|critical>",
      "message": "<what the issue is>",
      "guideline": "<which rule/guideline>"
    }
  ],
  "recommendation": "<one sentence summary of what to fix or 'Content appears compliant'>"
}`;

    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 600,
      messages: [{ role: "user", content: prompt }],
    });

    const raw = (response.content[0] as { type: string; text: string }).text.trim();
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { overallScore: 100, flags: [], recommendation: "Content appears compliant" };

    const [flag] = await db.insert(complianceFlagsTable).values({
      userId: user.id,
      draftId: draft.id,
      overallScore: parsed.overallScore ?? 100,
      flags: parsed.flags ?? [],
      recommendation: parsed.recommendation ?? "Content appears compliant",
    }).returning();

    await db.update(postDraftsTable).set({
      complianceChecked: true,
      complianceScore: parsed.overallScore ?? 100,
      updatedAt: new Date(),
    }).where(eq(postDraftsTable.id, draft.id));

    res.json(flag);
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed to run compliance check" }); }
});

// ─── Publish Draft ─────────────────────────────────────────────────────────────
router.post("/auto-post/drafts/:id/publish", ...requirePost, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    const [draft] = await db.select().from(postDraftsTable)
      .where(and(eq(postDraftsTable.id, Number(req.params.id)), eq(postDraftsTable.userId, user.id)));
    if (!draft) { res.status(404).json({ error: "Draft not found" }); return; }

    if (draft.approvalRequired && draft.status !== "approved") {
      res.status(403).json({ error: "Draft requires manager approval before publishing", status: draft.status });
      return;
    }

    const { scheduledAt, platformVariants: variantOverrides, platformHashtags: hashtagOverrides } = req.body;
    const platforms = draft.selectedPlatforms as string[];
    if (platforms.length === 0) { res.status(400).json({ error: "No platforms selected" }); return; }

    // Persist any user-edited variants to the DB before creating jobs
    const resolvedVariants = { ...(draft.platformVariants as Record<string, string> ?? {}), ...variantOverrides };
    const resolvedHashtags = { ...(draft.platformHashtags as Record<string, string[]> ?? {}), ...hashtagOverrides };

    if (variantOverrides || hashtagOverrides) {
      await db.update(postDraftsTable).set({
        platformVariants: resolvedVariants,
        platformHashtags: resolvedHashtags,
        updatedAt: new Date(),
      }).where(eq(postDraftsTable.id, draft.id));
    }

    const jobs = platforms.map(platform => ({
      userId: user.id,
      draftId: draft.id,
      platform,
      caption: resolvedVariants[platform] ?? draft.sourceCaption,
      mediaUrls: draft.mediaUrls as string[],
      hashtags: resolvedHashtags[platform] ?? [],
      status: "pending" as const,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
    }));

    const created = await db.insert(publishJobsTable).values(jobs).returning();

    await db.update(postDraftsTable).set({
      status: scheduledAt ? "draft" : "published",
      updatedAt: new Date(),
    }).where(eq(postDraftsTable.id, draft.id));

    res.status(201).json({
      message: `${created.length} publish job(s) created. Actual push stubbed — connect platform accounts to enable live posting.`,
      jobs: created,
    });
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed to publish draft" }); }
});

// ─── Publish Jobs ──────────────────────────────────────────────────────────────
router.get("/auto-post/publish-jobs", ...requirePost, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    const { draftId, status } = req.query;
    const conditions = [eq(publishJobsTable.userId, user.id)];
    if (draftId) conditions.push(eq(publishJobsTable.draftId, Number(draftId)));
    if (status) conditions.push(eq(publishJobsTable.status, String(status)));
    const jobs = await db.select().from(publishJobsTable)
      .where(and(...conditions)).orderBy(desc(publishJobsTable.createdAt));
    res.json(jobs);
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed to fetch jobs" }); }
});

router.post("/auto-post/publish-jobs/:id/retry", ...requirePost, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    const [job] = await db.select().from(publishJobsTable)
      .where(and(eq(publishJobsTable.id, Number(req.params.id)), eq(publishJobsTable.userId, user.id)));
    if (!job) { res.status(404).json({ error: "Publish job not found" }); return; }
    if (job.status !== "failed") { res.status(400).json({ error: "Only failed jobs can be retried" }); return; }
    if (job.attemptCount >= job.maxAttempts) { res.status(400).json({ error: `Max retry attempts (${job.maxAttempts}) reached` }); return; }

    const [updated] = await db.update(publishJobsTable).set({
      status: "pending",
      attemptCount: job.attemptCount + 1,
      errorMessage: null,
      lastAttemptAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(publishJobsTable.id, job.id)).returning();

    res.json({ message: "Job queued for retry", job: updated });
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed to retry job" }); }
});

// ─── Account Groups ────────────────────────────────────────────────────────────
router.get("/auto-post/account-groups", ...requirePost, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    await maybeAutoPostSeed(user.id);
    const groups = await db.select().from(accountGroupsTable)
      .where(eq(accountGroupsTable.userId, user.id)).orderBy(accountGroupsTable.name);
    const members = await db.select().from(accountGroupMembersTable)
      .where(eq(accountGroupMembersTable.userId, user.id));
    const result = groups.map(g => ({ ...g, members: members.filter(m => m.groupId === g.id) }));
    res.json(result);
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed to fetch groups" }); }
});

router.post("/auto-post/account-groups", ...requirePost, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    const { name, description, color, members } = req.body;
    if (!name) { res.status(400).json({ error: "name required" }); return; }
    const [group] = await db.insert(accountGroupsTable).values({ userId: user.id, name, description, color: color ?? "#2dd172" }).returning();
    if (Array.isArray(members) && members.length > 0) {
      await db.insert(accountGroupMembersTable).values(
        members.map((m: { platform: string; handle: string; displayName?: string; platformAccountId?: number }) => ({
          groupId: group.id, userId: user.id, platform: m.platform, handle: m.handle, displayName: m.displayName, platformAccountId: m.platformAccountId,
        }))
      );
    }
    const groupMembers = await db.select().from(accountGroupMembersTable).where(eq(accountGroupMembersTable.groupId, group.id));
    res.status(201).json({ ...group, members: groupMembers });
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed to create group" }); }
});

router.patch("/auto-post/account-groups/:id", ...requirePost, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    const { name, description, color, members } = req.body;
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (name !== undefined) patch.name = name;
    if (description !== undefined) patch.description = description;
    if (color !== undefined) patch.color = color;
    const [updated] = await db.update(accountGroupsTable).set(patch)
      .where(and(eq(accountGroupsTable.id, Number(req.params.id)), eq(accountGroupsTable.userId, user.id)))
      .returning();
    if (!updated) { res.status(404).json({ error: "Group not found" }); return; }
    if (Array.isArray(members)) {
      await db.delete(accountGroupMembersTable).where(eq(accountGroupMembersTable.groupId, updated.id));
      if (members.length > 0) {
        await db.insert(accountGroupMembersTable).values(
          members.map((m: { platform: string; handle: string; displayName?: string; platformAccountId?: number }) => ({
            groupId: updated.id, userId: user.id, platform: m.platform, handle: m.handle, displayName: m.displayName, platformAccountId: m.platformAccountId,
          }))
        );
      }
    }
    const groupMembers = await db.select().from(accountGroupMembersTable).where(eq(accountGroupMembersTable.groupId, updated.id));
    res.json({ ...updated, members: groupMembers });
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed to update group" }); }
});

router.delete("/auto-post/account-groups/:id", ...requirePost, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    const [deleted] = await db.delete(accountGroupsTable)
      .where(and(eq(accountGroupsTable.id, Number(req.params.id)), eq(accountGroupsTable.userId, user.id)))
      .returning();
    if (!deleted) { res.status(404).json({ error: "Group not found" }); return; }
    await db.delete(accountGroupMembersTable).where(eq(accountGroupMembersTable.groupId, deleted.id));
    res.status(204).end();
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed to delete group" }); }
});

router.post("/auto-post/account-groups/:id/publish", ...requirePost, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    const [group] = await db.select().from(accountGroupsTable)
      .where(and(eq(accountGroupsTable.id, Number(req.params.id)), eq(accountGroupsTable.userId, user.id)));
    if (!group) { res.status(404).json({ error: "Group not found" }); return; }
    const members = await db.select().from(accountGroupMembersTable).where(eq(accountGroupMembersTable.groupId, group.id));
    if (members.length === 0) { res.status(400).json({ error: "Group has no members" }); return; }

    const { draftId, sourceCaption, scheduledAt, platformVariants, platformHashtags } = req.body;
    if (!draftId && !sourceCaption) { res.status(400).json({ error: "draftId or sourceCaption required" }); return; }

    let draft: typeof postDraftsTable.$inferSelect | null = null;
    if (draftId) {
      const [d] = await db.select().from(postDraftsTable)
        .where(and(eq(postDraftsTable.id, Number(draftId)), eq(postDraftsTable.userId, user.id)));
      draft = d ?? null;
    }

    const variants = (platformVariants ?? draft?.platformVariants ?? {}) as Record<string, string>;
    const hashtags = (platformHashtags ?? draft?.platformHashtags ?? {}) as Record<string, string[]>;
    const caption = sourceCaption ?? draft?.sourceCaption ?? "";

    const jobs = members.map(m => ({
      userId: user.id,
      draftId: draft?.id ?? 0,
      platform: m.platform,
      platformAccountId: m.platformAccountId ?? undefined,
      caption: variants[m.platform] ?? caption,
      mediaUrls: draft?.mediaUrls as string[] ?? [],
      hashtags: hashtags[m.platform] ?? [],
      status: "pending" as const,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
    }));

    const created = await db.insert(publishJobsTable).values(jobs).returning();
    res.status(201).json({ message: `${created.length} jobs created for group "${group.name}"`, jobs: created });
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed to publish to group" }); }
});

// ─── Posting Time Recommendations ─────────────────────────────────────────────
router.get("/auto-post/posting-time-recommendations", ...requirePost, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    const { platform } = req.query;
    const recommendations = platform
      ? { [String(platform)]: OPTIMAL_TIMES[String(platform)] ?? OPTIMAL_TIMES.instagram }
      : OPTIMAL_TIMES;
    res.json({ recommendations, note: "Times are in WAT (West Africa Time, UTC+1). Based on Nigerian audience engagement patterns." });
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed to fetch recommendations" }); }
});

// ─── Hashtag Engine ────────────────────────────────────────────────────────────
router.get("/auto-post/hashtag-engine", ...requirePost, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    const { platform = "instagram", region = "NG", niche } = req.query;
    const plat = String(platform);
    const reg = String(region);

    // Get from DB cache first
    const dbTags = await db.select().from(hashtagCacheTable)
      .where(and(eq(hashtagCacheTable.platform, plat as any), eq(hashtagCacheTable.region, reg)))
      .orderBy(desc(hashtagCacheTable.trendScore))
      .limit(20);

    // Supplement with curated pools
    const pools = NIGERIA_HASHTAG_POOLS[plat] ?? {};
    const regionPool = pools[reg === "NG" ? "NG" : reg === "GH" ? "GH" : "diaspora"] ?? [];
    const nichePool = niche ? (pools[String(niche)] ?? []) : [];
    const curated = [...new Set([...regionPool, ...nichePool])].slice(0, 15);

    res.json({
      platform: plat,
      region: reg,
      niche: niche ?? null,
      dbTags: dbTags.map(t => ({ hashtag: t.hashtag, trendScore: t.trendScore, category: t.category })),
      curatedTags: curated,
      allSuggestions: [...new Set([...dbTags.map(t => t.hashtag), ...curated])].slice(0, 30),
    });
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed to fetch hashtags" }); }
});

// ─── Approval Requests ─────────────────────────────────────────────────────────
router.get("/auto-post/approval-requests", ...requirePost, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    const { status } = req.query;
    const conditions = [eq(approvalRequestsTable.userId, user.id)];
    if (status) conditions.push(eq(approvalRequestsTable.status, String(status)));
    const requests = await db.select().from(approvalRequestsTable)
      .where(and(...conditions)).orderBy(desc(approvalRequestsTable.createdAt));

    const draftIds = [...new Set(requests.map(r => r.draftId))];
    const drafts = draftIds.length > 0
      ? await db.select().from(postDraftsTable).where(and(eq(postDraftsTable.userId, user.id), inArray(postDraftsTable.id, draftIds)))
      : [];
    const draftMap = Object.fromEntries(drafts.map(d => [d.id, d]));

    res.json(requests.map(r => ({ ...r, draft: draftMap[r.draftId] ?? null })));
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed to fetch approval requests" }); }
});

router.post("/auto-post/approval-requests", ...requirePost, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    const { draftId } = req.body;
    if (!draftId) { res.status(400).json({ error: "draftId required" }); return; }
    const [draft] = await db.select().from(postDraftsTable)
      .where(and(eq(postDraftsTable.id, Number(draftId)), eq(postDraftsTable.userId, user.id)));
    if (!draft) { res.status(404).json({ error: "Draft not found" }); return; }

    const [req_] = await db.insert(approvalRequestsTable).values({
      userId: user.id,
      draftId: draft.id,
      requestedByUserId: user.id,
      status: "pending",
      notificationLog: [{ type: "whatsapp", sentAt: new Date().toISOString(), channel: "whatsapp_log", recipient: "manager" }],
    }).returning();

    await db.update(postDraftsTable).set({ status: "pending_approval", updatedAt: new Date() })
      .where(eq(postDraftsTable.id, draft.id));

    res.status(201).json(req_);
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed to create approval request" }); }
});

router.patch("/auto-post/approval-requests/:id", ...requirePost, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    const [request] = await db.select().from(approvalRequestsTable)
      .where(and(eq(approvalRequestsTable.id, Number(req.params.id)), eq(approvalRequestsTable.userId, user.id)));
    if (!request) { res.status(404).json({ error: "Approval request not found" }); return; }
    const { status, reviewNote } = req.body;
    if (!["approved", "rejected", "edited"].includes(status)) {
      res.status(400).json({ error: "status must be approved, rejected, or edited" }); return;
    }
    const notifLog = [...(request.notificationLog as Array<{ type: string; sentAt: string; channel: string }>),
      { type: `review_${status}`, sentAt: new Date().toISOString(), channel: "dashboard" }];

    const [updated] = await db.update(approvalRequestsTable).set({
      status, reviewNote, reviewedAt: new Date(), notificationLog: notifLog, updatedAt: new Date(),
    }).where(eq(approvalRequestsTable.id, request.id)).returning();

    await db.update(postDraftsTable).set({
      status: status === "approved" ? "approved" : status === "rejected" ? "rejected" : "draft",
      updatedAt: new Date(),
    }).where(eq(postDraftsTable.id, request.draftId));

    res.json(updated);
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed to update approval request" }); }
});

// ─── Background Auto-Retry Worker ─────────────────────────────────────────────
// Processes pending publish jobs every 60 seconds.
// Stubs actual platform push (marks as published).
// On permanent failure (maxAttempts reached), logs a manager alert to activity_log.
async function processPendingPublishJobs() {
  try {
    const now = new Date();
    // Pick up pending jobs that are not scheduled in the future
    const pending = await db.select().from(publishJobsTable)
      .where(and(
        eq(publishJobsTable.status, "pending"),
        lte(publishJobsTable.scheduledAt, now),
      ))
      .limit(20);

    // Also process unscheduled pending jobs (scheduledAt IS NULL)
    const unscheduled = await db.select().from(publishJobsTable)
      .where(eq(publishJobsTable.status, "pending"))
      .limit(20);

    const toProcess = [...new Map([...pending, ...unscheduled].map(j => [j.id, j])).values()];
    if (toProcess.length === 0) return;

    for (const job of toProcess) {
      // Stub: in production this would call the real platform API.
      // Simulate a ~90% success rate so demo data shows realistic failure states.
      const simulatedSuccess = Math.random() > 0.10;

      if (simulatedSuccess) {
        await db.update(publishJobsTable).set({
          status: "published",
          publishedAt: new Date(),
          lastAttemptAt: new Date(),
          attemptCount: job.attemptCount + 1,
          updatedAt: new Date(),
        }).where(eq(publishJobsTable.id, job.id));
      } else {
        const newAttemptCount = job.attemptCount + 1;
        const isPermanentlyFailed = newAttemptCount >= job.maxAttempts;

        await db.update(publishJobsTable).set({
          status: isPermanentlyFailed ? "failed" : "pending",
          attemptCount: newAttemptCount,
          errorMessage: isPermanentlyFailed
            ? `Publishing failed after ${newAttemptCount} attempt(s). Connect platform account to enable live push.`
            : `Attempt ${newAttemptCount} failed — will retry automatically.`,
          lastAttemptAt: new Date(),
          updatedAt: new Date(),
        }).where(eq(publishJobsTable.id, job.id));

        // Log a manager alert notification when a job permanently fails
        if (isPermanentlyFailed) {
          await db.insert(activityLogTable).values({
            userId: job.userId,
            type: "auto_post_job_failed",
            description: `Publish job #${job.id} for ${job.platform} permanently failed after ${newAttemptCount} attempt(s). Manual retry or reconnection required.`,
          }).catch(e => console.error("Failed to log publish failure:", e));
        }
      }
    }
  } catch (err) {
    console.error("[AutoPost Worker] Error processing jobs:", err);
  }
}

// Start the background worker (60s interval)
setInterval(processPendingPublishJobs, 60_000);
// Run once shortly after startup to process any pending jobs from a previous session
setTimeout(processPendingPublishJobs, 5_000);

export default router;
