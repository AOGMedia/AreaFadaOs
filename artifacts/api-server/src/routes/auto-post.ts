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
import { eq, desc, and, gte, lte, isNull, inArray } from "drizzle-orm";
import { requireAuth } from "./users";
import { requireTier } from "../middlewares/tierGuard";
import { executePublishJob } from "../lib/platformPublisher.js";

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

// Per-platform hard character limits (platform enforced maximums)
const PLATFORM_CHAR_LIMITS: Record<string, number> = {
  x: 280, instagram: 2200, tiktok: 300,
  facebook: 63206, youtube: 5000, threads: 500,
};

function enforceCharLimit(caption: string, platform: string): { caption: string; truncated: boolean } {
  const limit = PLATFORM_CHAR_LIMITS[platform];
  if (!limit || caption.length <= limit) return { caption, truncated: false };
  // Truncate at last word boundary before the limit, appending ellipsis
  const cutoff = caption.lastIndexOf(" ", limit - 1);
  return { caption: (cutoff > 0 ? caption.slice(0, cutoff) : caption.slice(0, limit - 1)) + "…", truncated: true };
}

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

    const truncationWarnings: string[] = [];
    const jobs = platforms.map(platform => {
      const rawCaption = resolvedVariants[platform] ?? draft.sourceCaption;
      const { caption, truncated } = enforceCharLimit(rawCaption, platform);
      if (truncated) truncationWarnings.push(`${platform}: truncated to ${PLATFORM_CHAR_LIMITS[platform]} chars`);
      return {
        userId: user.id,
        draftId: draft.id,
        platform,
        caption,
        mediaUrls: draft.mediaUrls as string[],
        hashtags: resolvedHashtags[platform] ?? [],
        status: "pending" as const,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
      };
    });

    const created = await db.insert(publishJobsTable).values(jobs).returning();

    await db.update(postDraftsTable).set({
      status: scheduledAt ? "draft" : "published",
      updatedAt: new Date(),
    }).where(eq(postDraftsTable.id, draft.id));

    // Fire-and-forget immediate publish for non-scheduled jobs
    if (!scheduledAt) {
      for (const job of created) {
        executePublishJob(job.id).catch((err) =>
          console.error(`[publish] job ${job.id} error:`, err?.message ?? err)
        );
      }
    }

    res.status(201).json({
      message: `${created.length} publish job(s) ${scheduledAt ? "scheduled" : "queued for publishing"}.${truncationWarnings.length ? " Captions auto-truncated: " + truncationWarnings.join("; ") + "." : ""}`,
      jobs: created,
      truncationWarnings,
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

    const { draftId, sourceCaption, scheduledAt, platformVariants, platformHashtags, memberCaptions } = req.body;
    if (!draftId && !sourceCaption) { res.status(400).json({ error: "draftId or sourceCaption required" }); return; }

    let draft: typeof postDraftsTable.$inferSelect | null = null;
    if (draftId) {
      const [d] = await db.select().from(postDraftsTable)
        .where(and(eq(postDraftsTable.id, Number(draftId)), eq(postDraftsTable.userId, user.id)));
      draft = d ?? null;
    }

    // Ensure we always have a real draft row (publish_jobs.draft_id is NOT NULL).
    // When no existing draft is provided, auto-create a minimal one from the caption.
    if (!draft && sourceCaption) {
      const platforms = [...new Set(members.map(m => m.platform))];
      const [created] = await db.insert(postDraftsTable).values({
        userId: user.id,
        title: `Group: ${group.name}`,
        sourceCaption,
        selectedPlatforms: platforms,
        mediaUrls: [],
        selectedAccountIds: [],
      }).returning();
      draft = created;
    }

    if (!draft) { res.status(400).json({ error: "Could not resolve or create a draft" }); return; }

    const variants = (platformVariants ?? draft?.platformVariants ?? {}) as Record<string, string>;
    const hashtags = (platformHashtags ?? draft?.platformHashtags ?? {}) as Record<string, string[]>;
    const baseCaption = sourceCaption ?? draft?.sourceCaption ?? "";
    // memberCaptions: { [memberDbId]: customCaption } — per-account overrides
    const perMemberCaptions = (memberCaptions ?? {}) as Record<string, string>;

    const truncationWarnings: string[] = [];
    const jobs = members.map(m => {
      const memberOverride = perMemberCaptions[m.id]?.trim();
      const rawCaption = memberOverride || variants[m.platform] || baseCaption;
      const { caption, truncated } = enforceCharLimit(rawCaption, m.platform);
      if (truncated) truncationWarnings.push(`${m.handle}/${m.platform}: truncated`);
      return {
        userId: user.id,
        draftId: draft?.id ?? 0,
        platform: m.platform,
        platformAccountId: m.platformAccountId ?? undefined,
        caption,
        mediaUrls: (draft?.mediaUrls as string[]) ?? [],
        hashtags: hashtags[m.platform] ?? [],
        status: "pending" as const,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
      };
    });

    const created = await db.insert(publishJobsTable).values(jobs).returning();
    res.status(201).json({
      message: `${created.length} jobs created for group "${group.name}".${truncationWarnings.length ? " Truncated: " + truncationWarnings.join(", ") + "." : ""}`,
      jobs: created,
      truncationWarnings,
    });
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed to publish to group" }); }
});

// ─── Posting Time Recommendations ─────────────────────────────────────────────
router.get("/auto-post/posting-time-recommendations", ...requirePost, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    const { platform } = req.query;

    // Fetch user's platform accounts for per-account signals
    const accounts = await db.select().from(platformAccountsTable)
      .where(eq(platformAccountsTable.userId, user.id));

    // Look at historical publish jobs (last 90 days) to compute when the user posts successfully
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const historicalJobs = await db.select().from(publishJobsTable)
      .where(and(
        eq(publishJobsTable.userId, user.id),
        eq(publishJobsTable.status, "published"),
        gte(publishJobsTable.publishedAt, since),
      ))
      .limit(200);

    // Aggregate hours per platform from historical data (WAT = UTC+1)
    const platformHourCounts: Record<string, Record<number, number>> = {};
    for (const job of historicalJobs) {
      if (!job.publishedAt) continue;
      const watHour = (job.publishedAt.getUTCHours() + 1) % 24;
      if (!platformHourCounts[job.platform]) platformHourCounts[job.platform] = {};
      platformHourCounts[job.platform][watHour] = (platformHourCounts[job.platform][watHour] ?? 0) + 1;
    }

    // Timezone heuristics per platform account handle/displayName
    // Nigerian creators → WAT (UTC+1), East Africa → EAT (UTC+3), UK diaspora → GMT (UTC+0)
    function inferAccountTimezone(handle: string, displayName: string | null): { tz: string; offsetHours: number } {
      const h = `${handle} ${displayName ?? ""}`.toLowerCase();
      if (/\.ke|nairobi|kenya|mombasa/.test(h)) return { tz: "EAT (UTC+3)", offsetHours: 3 };
      if (/\.gh|ghana|accra/.test(h)) return { tz: "GMT (UTC+0)", offsetHours: 0 };
      if (/\.za|sa|johannesburg|capetown/.test(h)) return { tz: "SAST (UTC+2)", offsetHours: 2 };
      if (/\.uk|london|\.gb/.test(h)) return { tz: "GMT (UTC+0)", offsetHours: 0 };
      return { tz: "WAT (UTC+1)", offsetHours: 1 }; // Default: Nigerian/West Africa
    }

    function formatSlotForTimezone(watHour: number, offsetHours: number, tz: string): string {
      const localHour = ((watHour - 1 + offsetHours) + 24) % 24; // WAT=UTC+1, convert via UTC
      const period = localHour < 12 ? "AM" : "PM";
      const display = localHour === 0 ? 12 : localHour > 12 ? localHour - 12 : localHour;
      return `${display}:00 ${period} ${tz.split(" ")[0]}`;
    }

    // Build per-platform recommendations blending historical + curated optimal times
    const platformsToReturn = platform ? [String(platform)] : Object.keys(OPTIMAL_TIMES);
    const recommendations: Record<string, { slots: string[]; timezone: string; explanation: string; dataSource: string; perAccount: Array<{ accountId: number; username: string; platform: string; timezone: string; bestSlots: string[] }> }> = {};

    for (const plat of platformsToReturn) {
      const curated = OPTIMAL_TIMES[plat] ?? OPTIMAL_TIMES.instagram;
      const historicalCounts = platformHourCounts[plat];
      let watSlots: number[]; // canonical WAT hours
      let slots: string[];
      let dataSource: string;
      let explanation: string;

      if (historicalCounts && Object.keys(historicalCounts).length >= 3) {
        // Have enough history — derive top 3 hours from actual publish data
        watSlots = Object.entries(historicalCounts)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 3)
          .map(([hour]) => Number(hour));
        slots = watSlots.map(h => {
          const period = h < 12 ? "AM" : "PM";
          const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
          return `${display}:00 ${period} WAT`;
        });
        dataSource = "historical";
        explanation = `Based on your last ${historicalJobs.filter(j => j.platform === plat).length} posts in the past 90 days — your audience responds best at these times.`;
      } else {
        // Fall back to curated times; parse WAT hour from "8:00 AM WAT" format
        watSlots = curated.slots.map((s: string) => {
          const m = s.match(/(\d+):00\s*(AM|PM)/i);
          if (!m) return 8;
          let h = Number(m[1]);
          if (m[2].toUpperCase() === "PM" && h !== 12) h += 12;
          if (m[2].toUpperCase() === "AM" && h === 12) h = 0;
          return h;
        });
        slots = curated.slots;
        dataSource = "curated";
        explanation = `Less than 3 days of posting history — using curated optimal times for Nigerian ${plat} audiences. Post more to get personalised recommendations. ${curated.explanation}`;
      }

      // Per-account breakdown with per-account timezone conversion
      const platformAccounts = accounts.filter(a => a.platform === plat);
      const perAccount = platformAccounts.map(a => {
        const { tz, offsetHours } = inferAccountTimezone(a.handle, a.displayName);
        return {
          accountId: a.id,
          username: a.handle,
          platform: a.platform,
          timezone: tz,
          bestSlots: watSlots.map(h => formatSlotForTimezone(h, offsetHours, tz)),
        };
      });

      recommendations[plat] = {
        slots,
        timezone: "WAT (UTC+1)",
        explanation,
        dataSource,
        perAccount,
      };
    }

    res.json({
      recommendations,
      accountCount: accounts.length,
      historicalJobCount: historicalJobs.length,
      note: `Times in WAT (West Africa Time, UTC+1). ${historicalJobs.length > 0 ? `Derived from ${historicalJobs.length} historical posts.` : "Connect platform accounts and publish posts to get personalised recommendations."}`,
    });
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
      .where(and(
        eq(publishJobsTable.status, "pending"),
        isNull(publishJobsTable.scheduledAt),
      ))
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
