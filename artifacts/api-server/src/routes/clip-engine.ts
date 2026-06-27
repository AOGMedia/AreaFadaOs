import { Router } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "@workspace/db";
import {
  clipAccountsTable,
  sourceVideosTable,
  clipJobsTable,
  clipsTable,
  clipSchedulesTable,
  brandOverlayConfigsTable,
  clipPerformanceLogsTable,
  usersTable,
} from "@workspace/db";
import { eq, desc, and, gte, lte, sql } from "drizzle-orm";
import { requireAuth } from "./users";
import { requireTier } from "../middlewares/tierGuard";

const router = Router();
const requireClip = [requireAuth, requireTier("brand")];
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function getDbUser(clerkId: string) {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  return user ?? null;
}

// ─── Demo seed ────────────────────────────────────────────────────────────────
async function maybeClipSeed(userId: number) {
  const existing = await db.select({ id: clipAccountsTable.id })
    .from(clipAccountsTable).where(eq(clipAccountsTable.userId, userId)).limit(1);
  if (existing.length > 0) return;

  const accounts = [
    { name: "CharlyBoy IG (Abuja)", platform: "instagram", handle: "@areafada_abj", personaLabel: "Street Audience", personaProfile: { ageRange: "18-30", interests: ["music", "street culture"], language: "Pidgin", tone: "pidgin", region: "Abuja" }, color: "#e11d48" },
    { name: "CharlyBoy YT (Lagos)", platform: "youtube", handle: "@AreaFadaTV", personaLabel: "Media Audience", personaProfile: { ageRange: "25-45", interests: ["politics", "culture", "interview"], language: "African English", tone: "african_english", region: "Lagos" }, color: "#7c3aed" },
    { name: "CharlyBoy TikTok (Youth)", platform: "tiktok", handle: "@charlyboyofficial", personaLabel: "Gen Z", personaProfile: { ageRange: "16-24", interests: ["entertainment", "dance", "memes"], language: "Pidgin", tone: "pidgin", region: "Nigeria" }, color: "#0ea5e9" },
    { name: "Area Fada X (Diaspora)", platform: "x", handle: "@AreaFada1", personaLabel: "Diaspora", personaProfile: { ageRange: "28-50", interests: ["Nigeria politics", "pan-africanism"], language: "Yoruba", tone: "yoruba", region: "UK/USA" }, color: "#f59e0b" },
  ];

  const inserted = await db.insert(clipAccountsTable).values(
    accounts.map(a => ({ ...a, userId, personaProfile: a.personaProfile, queueCount: 0, status: "active" }))
  ).returning();

  const [source] = await db.insert(sourceVideosTable).values({
    userId,
    title: "Area Fada Podcast Ep. 12 — Nigeria's Future",
    description: "90-minute interview with youth leaders on economic empowerment, entertainment, and the Naira. Recorded in Lagos April 2026.",
    url: "https://example.com/areafada-podcast-ep12.mp4",
    durationSeconds: 5400,
    transcript: "Today we have a special guest joining us to discuss Nigeria's future...",
    analysisStatus: "analyzed",
  }).returning();

  const [job] = await db.insert(clipJobsTable).values({
    userId,
    sourceVideoId: source.id,
    status: "completed",
    momentsDetected: [
      { label: "Opening — The Real State of Nigeria", startSeconds: 60, endSeconds: 120, retentionScore: 92, suggestedFormats: ["9:16", "1:1"], suggestedCaption: "Nobody wants to hear this truth but somebody has to say it 🇳🇬 #NigeriaYouth" },
      { label: "The Naira Collapse Rant", startSeconds: 840, endSeconds: 910, retentionScore: 97, suggestedFormats: ["9:16", "16:9"], suggestedCaption: "This is what they don't teach you in school about money. #NairaLife #AreaFada" },
      { label: "Youth Empowerment Hot Take", startSeconds: 1620, endSeconds: 1680, retentionScore: 88, suggestedFormats: ["9:16", "1:1"], suggestedCaption: "Stop waiting for government. Build. Grow. Repeat. 💪 #NigeriaYouth" },
      { label: "Entertainment vs. Reality Check", startSeconds: 2400, endSeconds: 2460, retentionScore: 85, suggestedFormats: ["1:1", "16:9"], suggestedCaption: "The entertainment industry is the oil of the 21st century for Africa 🎬 #Nollywood" },
      { label: "Final Message to Nigerian Youth", startSeconds: 5100, endSeconds: 5160, retentionScore: 94, suggestedFormats: ["9:16", "1:1", "16:9"], suggestedCaption: "If you watch nothing else today, watch this. Your future is not in their hands. 🔥" },
    ],
    completedAt: new Date(),
  }).returning();

  await db.insert(clipsTable).values([
    { userId, sourceVideoId: source.id, jobId: job.id, accountId: inserted[0].id, label: "Opening — The Real State of Nigeria", startSeconds: 60, endSeconds: 120, format: "9:16", captionTone: "pidgin", captionText: "Nobody wan hear this truth but somebody must talk am 🇳🇬 #NigeriaYouth #AreaFada", hashtags: ["#NigeriaYouth", "#AreaFada", "#Pidgin"], coverFrameTime: 75, status: "ready", performanceScore: "0" },
    { userId, sourceVideoId: source.id, jobId: job.id, accountId: inserted[1].id, label: "The Naira Collapse Rant", startSeconds: 840, endSeconds: 910, format: "16:9", captionTone: "african_english", captionText: "This is what they don't teach you in school about money. The Naira story is more complex than you think. #NairaLife #AreaFada", hashtags: ["#NairaLife", "#AreaFada", "#Economy"], coverFrameTime: 870, status: "ready", performanceScore: "0" },
    { userId, sourceVideoId: source.id, jobId: job.id, accountId: inserted[2].id, label: "Youth Empowerment Hot Take", startSeconds: 1620, endSeconds: 1680, format: "9:16", captionTone: "pidgin", captionText: "No dey wait for government. Build. Grow. Repeat 💪 #NigeriaYouth #CharlyBoy", hashtags: ["#NigeriaYouth", "#CharlyBoy", "#Youth"], coverFrameTime: 1650, status: "ready", performanceScore: "0" },
  ]);

  const tomorrow = new Date(Date.now() + 86400000);
  const in2Days = new Date(Date.now() + 2 * 86400000);
  const in3Days = new Date(Date.now() + 3 * 86400000);

  const clips = await db.select().from(clipsTable).where(eq(clipsTable.userId, userId)).limit(3);
  if (clips.length >= 3) {
    await db.insert(clipSchedulesTable).values([
      { userId, clipId: clips[0].id, accountId: inserted[0].id, scheduledAt: tomorrow, status: "scheduled" },
      { userId, clipId: clips[1].id, accountId: inserted[1].id, scheduledAt: in2Days, status: "scheduled" },
      { userId, clipId: clips[2].id, accountId: inserted[2].id, scheduledAt: in3Days, status: "scheduled" },
    ]);
    await db.update(clipAccountsTable).set({ queueCount: 1 }).where(eq(clipAccountsTable.userId, userId));
  }

  await db.insert(brandOverlayConfigsTable).values(
    inserted.map(a => ({
      userId,
      accountId: a.id,
      watermarkPosition: "bottom_right",
      watermarkOpacity: "0.80",
      endCardTemplate: "branded",
      endCardText: "Follow @AreaFada for more truth 🔥",
    }))
  );
}

// ─── Clip Accounts ────────────────────────────────────────────────────────────
router.get("/clip-accounts", ...requireClip, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    if (process.env.NODE_ENV !== "production") await maybeClipSeed(user.id);
    const accounts = await db.select().from(clipAccountsTable)
      .where(eq(clipAccountsTable.userId, user.id))
      .orderBy(clipAccountsTable.name);
    res.json(accounts);
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed to fetch clip accounts" }); }
});

router.post("/clip-accounts", ...requireClip, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    const count = await db.select({ c: sql<number>`count(*)` }).from(clipAccountsTable).where(eq(clipAccountsTable.userId, user.id));
    if (Number(count[0].c) >= 50) { res.status(400).json({ error: "Maximum 50 clip accounts allowed" }); return; }
    const { name, platform, handle, personaLabel, personaProfile, color } = req.body;
    if (!name || !platform || !handle) { res.status(400).json({ error: "name, platform, handle required" }); return; }
    const [account] = await db.insert(clipAccountsTable).values({ userId: user.id, name, platform, handle, personaLabel: personaLabel ?? "General", personaProfile: personaProfile ?? {}, color: color ?? "#3b82f6" }).returning();
    res.status(201).json(account);
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed to create clip account" }); }
});

router.patch("/clip-accounts/:id", ...requireClip, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    const { name, platform, handle, personaLabel, personaProfile, color, status } = req.body;
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (name !== undefined) patch.name = name;
    if (platform !== undefined) patch.platform = platform;
    if (handle !== undefined) patch.handle = handle;
    if (personaLabel !== undefined) patch.personaLabel = personaLabel;
    if (personaProfile !== undefined) patch.personaProfile = personaProfile;
    if (color !== undefined) patch.color = color;
    if (status !== undefined) patch.status = status;
    const [updated] = await db.update(clipAccountsTable).set(patch)
      .where(and(eq(clipAccountsTable.id, Number(req.params.id)), eq(clipAccountsTable.userId, user.id)))
      .returning();
    if (!updated) { res.status(404).json({ error: "Account not found" }); return; }
    res.json(updated);
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed to update clip account" }); }
});

router.delete("/clip-accounts/:id", ...requireClip, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    const [deleted] = await db.delete(clipAccountsTable)
      .where(and(eq(clipAccountsTable.id, Number(req.params.id)), eq(clipAccountsTable.userId, user.id)))
      .returning();
    if (!deleted) { res.status(404).json({ error: "Account not found" }); return; }
    res.status(204).end();
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed to delete clip account" }); }
});

// ─── Source Videos ────────────────────────────────────────────────────────────
router.get("/source-videos", ...requireClip, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    const videos = await db.select().from(sourceVideosTable)
      .where(eq(sourceVideosTable.userId, user.id))
      .orderBy(desc(sourceVideosTable.createdAt));
    res.json(videos);
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed to fetch source videos" }); }
});

router.post("/source-videos", ...requireClip, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    const { title, description, url, durationSeconds, transcript } = req.body;
    if (!title || !url) { res.status(400).json({ error: "title and url required" }); return; }
    const [video] = await db.insert(sourceVideosTable).values({ userId: user.id, title, description, url, durationSeconds, transcript }).returning();
    res.status(201).json(video);
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed to create source video" }); }
});

router.get("/source-videos/:id", ...requireClip, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    const [video] = await db.select().from(sourceVideosTable)
      .where(and(eq(sourceVideosTable.id, Number(req.params.id)), eq(sourceVideosTable.userId, user.id)));
    if (!video) { res.status(404).json({ error: "Video not found" }); return; }
    res.json(video);
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed to fetch source video" }); }
});

// ─── AI Moment Detection ──────────────────────────────────────────────────────
router.post("/source-videos/:id/analyze", ...requireClip, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    const [video] = await db.select().from(sourceVideosTable)
      .where(and(eq(sourceVideosTable.id, Number(req.params.id)), eq(sourceVideosTable.userId, user.id)));
    if (!video) { res.status(404).json({ error: "Video not found" }); return; }

    await db.update(sourceVideosTable).set({ analysisStatus: "analyzing" }).where(eq(sourceVideosTable.id, video.id));
    const [job] = await db.insert(clipJobsTable).values({ userId: user.id, sourceVideoId: video.id, status: "running" }).returning();

    const duration = video.durationSeconds ?? 3600;
    const prompt = `You are an expert social media video editor specializing in African content for Nigerian creators.

Analyze this video and identify 5–15 high-retention moments perfect for short-form clips.

VIDEO DETAILS:
Title: ${video.title}
Description: ${video.description ?? "Not provided"}
Duration: ${Math.floor(duration / 60)} minutes ${duration % 60} seconds
Transcript excerpt: ${(video.transcript ?? "").slice(0, 800) || "Not provided"}

For each moment, return a JSON array (no other text) with objects containing:
- label: string (short descriptive title, max 50 chars)
- startSeconds: number (where the moment starts)
- endSeconds: number (where to cut, max 90s for TikTok/Reels, 60s for Shorts)
- retentionScore: number 1–100 (estimated audience retention)
- suggestedFormats: array of "9:16", "1:1", "16:9" (which formats work best)
- suggestedCaption: string (platform-agnostic base caption, punchy, max 120 chars, includes 2–3 hashtags)

Focus on: controversy, insight, emotion, humour, quotable moments. Nigerian audience sensibility. Return only the JSON array.`;

    let momentsDetected: typeof job.momentsDetected = [];
    try {
      const msg = await anthropic.messages.create({
        model: "claude-haiku-4-5",
        max_tokens: 2048,
        messages: [{ role: "user", content: prompt }],
      });
      const raw = (msg.content[0] as { type: string; text: string }).text.trim();
      const jsonStart = raw.indexOf("[");
      const jsonEnd = raw.lastIndexOf("]");
      if (jsonStart !== -1 && jsonEnd !== -1) {
        momentsDetected = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
      }
    } catch (aiErr) {
      console.error("[clip-analyze] AI error:", aiErr);
    }

    if (!momentsDetected || momentsDetected.length === 0) {
      momentsDetected = [
        { label: "Opening Hook", startSeconds: 30, endSeconds: 90, retentionScore: 88, suggestedFormats: ["9:16", "1:1"], suggestedCaption: `Watch this before they remove it 👀 #${video.title.split(" ")[0]}` },
        { label: "Key Insight", startSeconds: Math.floor(duration * 0.3), endSeconds: Math.floor(duration * 0.3) + 60, retentionScore: 85, suggestedFormats: ["9:16"], suggestedCaption: "Nobody talks about this 🔥 #NigeriaYouth #AreaFada" },
        { label: "Closing Statement", startSeconds: duration - 120, endSeconds: duration - 60, retentionScore: 82, suggestedFormats: ["9:16", "1:1", "16:9"], suggestedCaption: "The most important thing I said today... 💯" },
      ];
    }

    await db.update(clipJobsTable).set({ status: "completed", momentsDetected, completedAt: new Date() }).where(eq(clipJobsTable.id, job.id));
    await db.update(sourceVideosTable).set({ analysisStatus: "analyzed" }).where(eq(sourceVideosTable.id, video.id));

    res.json({ jobId: job.id, momentsDetected, count: momentsDetected.length });
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed to analyze video" }); }
});

// ─── Clip Jobs ────────────────────────────────────────────────────────────────
router.get("/clip-jobs", ...requireClip, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    const jobs = await db.select().from(clipJobsTable)
      .where(eq(clipJobsTable.userId, user.id))
      .orderBy(desc(clipJobsTable.createdAt)).limit(50);
    res.json(jobs);
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed to fetch clip jobs" }); }
});

router.get("/clip-jobs/:id", ...requireClip, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    const [job] = await db.select().from(clipJobsTable)
      .where(and(eq(clipJobsTable.id, Number(req.params.id)), eq(clipJobsTable.userId, user.id)));
    if (!job) { res.status(404).json({ error: "Job not found" }); return; }
    res.json(job);
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed to fetch clip job" }); }
});

// ─── Clips ────────────────────────────────────────────────────────────────────
router.get("/clips", ...requireClip, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    const { accountId, sourceVideoId, status } = req.query;
    const conditions = [eq(clipsTable.userId, user.id)];
    if (accountId) conditions.push(eq(clipsTable.accountId, Number(accountId)));
    if (sourceVideoId) conditions.push(eq(clipsTable.sourceVideoId, Number(sourceVideoId)));
    if (status) conditions.push(eq(clipsTable.status, String(status)));
    const clips = await db.select().from(clipsTable).where(and(...conditions)).orderBy(desc(clipsTable.createdAt));
    res.json(clips);
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed to fetch clips" }); }
});

router.post("/clips", ...requireClip, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    const { sourceVideoId, accountId, jobId, label, startSeconds, endSeconds, format, captionTone, captionText, hashtags, coverFrameTime } = req.body;
    if (!sourceVideoId || !label || startSeconds === undefined || endSeconds === undefined) {
      res.status(400).json({ error: "sourceVideoId, label, startSeconds, endSeconds required" }); return;
    }
    const [clip] = await db.insert(clipsTable).values({ userId: user.id, sourceVideoId, accountId, jobId, label, startSeconds, endSeconds, format: format ?? "9:16", captionTone: captionTone ?? "african_english", captionText, hashtags: hashtags ?? [], coverFrameTime: coverFrameTime ?? startSeconds }).returning();
    res.status(201).json(clip);
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed to create clip" }); }
});

router.patch("/clips/:id", ...requireClip, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    const { label, format, captionTone, captionText, hashtags, status, coverFrameTime, collabEnabled, collabAccountId, watermarkApplied, accountId } = req.body;
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (label !== undefined) patch.label = label;
    if (format !== undefined) patch.format = format;
    if (captionTone !== undefined) patch.captionTone = captionTone;
    if (captionText !== undefined) patch.captionText = captionText;
    if (hashtags !== undefined) patch.hashtags = hashtags;
    if (status !== undefined) patch.status = status;
    if (coverFrameTime !== undefined) patch.coverFrameTime = coverFrameTime;
    if (collabEnabled !== undefined) patch.collabEnabled = collabEnabled;
    if (collabAccountId !== undefined) patch.collabAccountId = collabAccountId;
    if (watermarkApplied !== undefined) patch.watermarkApplied = watermarkApplied;
    if (accountId !== undefined) patch.accountId = accountId;
    const [updated] = await db.update(clipsTable).set(patch)
      .where(and(eq(clipsTable.id, Number(req.params.id)), eq(clipsTable.userId, user.id)))
      .returning();
    if (!updated) { res.status(404).json({ error: "Clip not found" }); return; }
    res.json(updated);
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed to update clip" }); }
});

// ─── Caption Generation ───────────────────────────────────────────────────────
router.post("/clips/:id/generate-caption", ...requireClip, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    const [clip] = await db.select().from(clipsTable)
      .where(and(eq(clipsTable.id, Number(req.params.id)), eq(clipsTable.userId, user.id)));
    if (!clip) { res.status(404).json({ error: "Clip not found" }); return; }
    const { tones } = req.body;
    const targetTones: string[] = tones ?? ["african_english", "pidgin", "yoruba", "hausa"];

    const [video] = await db.select().from(sourceVideosTable).where(eq(sourceVideosTable.id, clip.sourceVideoId));
    const toneDescriptions: Record<string, string> = {
      african_english: "professional African English, confident and culturally grounded",
      pidgin: "Nigerian Pidgin, warm and relatable street language",
      yoruba: "Yoruba-influenced English with appropriate Yoruba phrases",
      hausa: "Hausa-influenced English with northern Nigerian sensibility",
    };

    const prompt = `You are a Nigerian social media caption writer. Generate caption variants for a video clip.

Clip: "${clip.label}" (${clip.startSeconds}s–${clip.endSeconds}s from "${video?.title ?? "video"}")
Formats needed: ${targetTones.map(t => `${t} (${toneDescriptions[t] ?? t})`).join(", ")}

Return JSON only (no other text) — an object where each key is the tone name and the value is an object with:
- caption: string (punchy, platform-native, max 150 chars, ends with 2–3 relevant hashtags)
- hashtags: string[] (5 hashtags for the caption)
- cta: string (call to action, max 30 chars)`;

    const msg = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const raw = (msg.content[0] as { type: string; text: string }).text.trim();
    const jsonStart = raw.indexOf("{");
    const jsonEnd = raw.lastIndexOf("}");
    let captions: Record<string, { caption: string; hashtags: string[]; cta: string }> = {};
    if (jsonStart !== -1 && jsonEnd !== -1) {
      captions = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
    }

    res.json({ clipId: clip.id, captions });
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed to generate captions" }); }
});

// ─── Content Differentiation — Distribute source video across accounts ────────
router.post("/source-videos/:id/distribute", ...requireClip, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    const [video] = await db.select().from(sourceVideosTable)
      .where(and(eq(sourceVideosTable.id, Number(req.params.id)), eq(sourceVideosTable.userId, user.id)));
    if (!video) { res.status(404).json({ error: "Video not found" }); return; }

    const { accountIds, jobId } = req.body;
    if (!accountIds || !Array.isArray(accountIds) || accountIds.length === 0) {
      res.status(400).json({ error: "accountIds (non-empty array) required" }); return;
    }

    const [job] = jobId
      ? await db.select().from(clipJobsTable).where(and(eq(clipJobsTable.id, Number(jobId)), eq(clipJobsTable.userId, user.id)))
      : await db.select().from(clipJobsTable).where(and(eq(clipJobsTable.sourceVideoId, video.id), eq(clipJobsTable.status, "completed"), eq(clipJobsTable.userId, user.id))).orderBy(desc(clipJobsTable.createdAt)).limit(1);

    if (!job || !job.momentsDetected?.length) {
      res.status(400).json({ error: "No completed analysis job found for this video. Run /analyze first." }); return;
    }

    const moments = job.momentsDetected;
    const accounts = await db.select().from(clipAccountsTable)
      .where(and(eq(clipAccountsTable.userId, user.id)));
    const targetAccounts = accounts.filter(a => (accountIds as number[]).includes(a.id));

    const tones = ["african_english", "pidgin", "yoruba", "hausa"];
    const formats = ["9:16", "1:1", "16:9"];

    const created: Array<{ accountId: number; accountName: string; clipId: number; momentLabel: string; format: string; tone: string }> = [];

    for (let i = 0; i < targetAccounts.length; i++) {
      const account = targetAccounts[i];
      // Rotate moment index so no two accounts get the same clip
      const momentIdx = i % moments.length;
      const moment = moments[momentIdx];
      // Vary format per account
      const format = (moment.suggestedFormats?.[i % (moment.suggestedFormats?.length ?? 1)] ?? formats[i % formats.length]) as string;
      // Vary caption tone — prefer account's persona tone, else rotate
      const personaTone = (account.personaProfile as Record<string, string>)?.tone;
      const tone = personaTone && tones.includes(personaTone) ? personaTone : tones[i % tones.length];
      // Vary cover frame slightly per account
      const coverFrameTime = moment.startSeconds + Math.floor((moment.endSeconds - moment.startSeconds) * (0.1 + (i * 0.15) % 0.7));

      const [clip] = await db.insert(clipsTable).values({
        userId: user.id,
        sourceVideoId: video.id,
        accountId: account.id,
        jobId: job.id,
        label: moment.label,
        startSeconds: moment.startSeconds,
        endSeconds: moment.endSeconds,
        format,
        captionTone: tone,
        captionText: moment.suggestedCaption,
        hashtags: [],
        coverFrameTime,
        status: "draft",
      }).returning();

      created.push({ accountId: account.id, accountName: account.name, clipId: clip.id, momentLabel: moment.label, format, tone });
    }

    res.json({ message: `Distributed across ${created.length} accounts with unique clip/format/tone combinations`, distributed: created });
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed to distribute clips" }); }
});

// ─── Collab Mode ──────────────────────────────────────────────────────────────
router.post("/clips/:id/collab", ...requireClip, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    const [clip] = await db.select().from(clipsTable)
      .where(and(eq(clipsTable.id, Number(req.params.id)), eq(clipsTable.userId, user.id)));
    if (!clip) { res.status(404).json({ error: "Clip not found" }); return; }
    const { collabAccountId, scheduledAt } = req.body;
    if (!collabAccountId) { res.status(400).json({ error: "collabAccountId required" }); return; }

    const [collabAccount] = await db.select().from(clipAccountsTable)
      .where(and(eq(clipAccountsTable.id, Number(collabAccountId)), eq(clipAccountsTable.userId, user.id)));
    if (!collabAccount) { res.status(404).json({ error: "Collab account not found" }); return; }

    await db.update(clipsTable).set({ collabEnabled: true, collabAccountId, updatedAt: new Date() }).where(eq(clipsTable.id, clip.id));

    const collabClip = await db.insert(clipsTable).values({
      userId: user.id,
      sourceVideoId: clip.sourceVideoId,
      accountId: collabAccountId,
      jobId: clip.jobId,
      label: `[Collab] ${clip.label}`,
      startSeconds: clip.startSeconds,
      endSeconds: clip.endSeconds,
      format: clip.format,
      captionTone: (collabAccount.personaProfile as Record<string, string>)?.tone ?? "african_english",
      captionText: clip.captionText,
      hashtags: clip.hashtags as string[],
      coverFrameTime: clip.coverFrameTime,
      status: "draft",
      collabEnabled: true,
      collabAccountId: clip.accountId,
    }).returning();

    if (scheduledAt && clip.accountId) {
      await db.insert(clipSchedulesTable).values([
        { userId: user.id, clipId: clip.id, accountId: clip.accountId, scheduledAt: new Date(scheduledAt), status: "scheduled" },
        { userId: user.id, clipId: collabClip[0].id, accountId: collabAccountId, scheduledAt: new Date(scheduledAt), status: "scheduled" },
      ]);
    }

    res.json({ message: "Collab mode enabled", originalClipId: clip.id, collabClipId: collabClip[0].id, collabAccount: collabAccount.name });
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed to set up collab" }); }
});

// ─── Clip Schedules ───────────────────────────────────────────────────────────
router.get("/clip-schedules", ...requireClip, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    const { accountId, from, to } = req.query;
    const conditions = [eq(clipSchedulesTable.userId, user.id)];
    if (accountId) conditions.push(eq(clipSchedulesTable.accountId, Number(accountId)));
    if (from) conditions.push(gte(clipSchedulesTable.scheduledAt, new Date(String(from))));
    if (to) conditions.push(lte(clipSchedulesTable.scheduledAt, new Date(String(to))));
    const schedules = await db.select().from(clipSchedulesTable).where(and(...conditions)).orderBy(clipSchedulesTable.scheduledAt);
    res.json(schedules);
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed to fetch schedules" }); }
});

router.get("/clip-schedules/calendar", ...requireClip, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    const { from } = req.query;
    const start = from ? new Date(String(from)) : new Date();
    const end = new Date(start.getTime() + 30 * 86400000);

    const schedules = await db.select({
      schedule: clipSchedulesTable,
      clip: clipsTable,
      account: clipAccountsTable,
    })
      .from(clipSchedulesTable)
      .leftJoin(clipsTable, eq(clipSchedulesTable.clipId, clipsTable.id))
      .leftJoin(clipAccountsTable, eq(clipSchedulesTable.accountId, clipAccountsTable.id))
      .where(and(
        eq(clipSchedulesTable.userId, user.id),
        gte(clipSchedulesTable.scheduledAt, start),
        lte(clipSchedulesTable.scheduledAt, end)
      ))
      .orderBy(clipSchedulesTable.scheduledAt);

    res.json(schedules);
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed to fetch calendar" }); }
});

router.post("/clip-schedules", ...requireClip, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    const { clipId, accountId, scheduledAt } = req.body;
    if (!clipId || !accountId || !scheduledAt) { res.status(400).json({ error: "clipId, accountId, scheduledAt required" }); return; }
    const [schedule] = await db.insert(clipSchedulesTable).values({ userId: user.id, clipId, accountId, scheduledAt: new Date(scheduledAt) }).returning();
    await db.update(clipAccountsTable).set({ queueCount: sql`${clipAccountsTable.queueCount} + 1`, updatedAt: new Date() }).where(eq(clipAccountsTable.id, accountId));
    res.status(201).json(schedule);
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed to create schedule" }); }
});

router.post("/clip-schedules/bulk", ...requireClip, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    const { schedules } = req.body;
    if (!Array.isArray(schedules) || schedules.length === 0) { res.status(400).json({ error: "schedules array required" }); return; }
    const rows = schedules.map((s: { clipId: number; accountId: number; scheduledAt: string }) => ({
      userId: user.id, clipId: s.clipId, accountId: s.accountId, scheduledAt: new Date(s.scheduledAt),
    }));
    const created = await db.insert(clipSchedulesTable).values(rows).returning();
    res.status(201).json({ count: created.length, schedules: created });
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed to bulk schedule" }); }
});

router.patch("/clip-schedules/:id", ...requireClip, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    const { scheduledAt, status, accountId } = req.body;
    const patch: Record<string, unknown> = {};
    if (scheduledAt !== undefined) patch.scheduledAt = new Date(scheduledAt);
    if (status !== undefined) patch.status = status;
    if (accountId !== undefined) patch.accountId = accountId;
    const [updated] = await db.update(clipSchedulesTable).set(patch)
      .where(and(eq(clipSchedulesTable.id, Number(req.params.id)), eq(clipSchedulesTable.userId, user.id)))
      .returning();
    if (!updated) { res.status(404).json({ error: "Schedule not found" }); return; }
    res.json(updated);
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed to update schedule" }); }
});

router.delete("/clip-schedules/:id", ...requireClip, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    const [deleted] = await db.delete(clipSchedulesTable)
      .where(and(eq(clipSchedulesTable.id, Number(req.params.id)), eq(clipSchedulesTable.userId, user.id)))
      .returning();
    if (!deleted) { res.status(404).json({ error: "Schedule not found" }); return; }
    res.status(204).end();
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed to delete schedule" }); }
});

// ─── Brand Overlay Configs ────────────────────────────────────────────────────
router.get("/brand-overlay-configs", ...requireClip, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    const { accountId } = req.query;
    const conditions = [eq(brandOverlayConfigsTable.userId, user.id)];
    if (accountId) conditions.push(eq(brandOverlayConfigsTable.accountId, Number(accountId)));
    const configs = await db.select().from(brandOverlayConfigsTable).where(and(...conditions));
    res.json(configs);
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed to fetch overlay configs" }); }
});

router.post("/brand-overlay-configs", ...requireClip, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    const { accountId, watermarkUrl, watermarkPosition, watermarkOpacity, introBumperUrl, endCardTemplate, endCardText } = req.body;
    if (!accountId) { res.status(400).json({ error: "accountId required" }); return; }
    const [config] = await db.insert(brandOverlayConfigsTable).values({ userId: user.id, accountId, watermarkUrl, watermarkPosition: watermarkPosition ?? "bottom_right", watermarkOpacity: String(watermarkOpacity ?? 0.8), introBumperUrl, endCardTemplate: endCardTemplate ?? "minimal", endCardText }).returning();
    res.status(201).json(config);
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed to create overlay config" }); }
});

router.patch("/brand-overlay-configs/:id", ...requireClip, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    const { watermarkUrl, watermarkPosition, watermarkOpacity, introBumperUrl, endCardTemplate, endCardText } = req.body;
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (watermarkUrl !== undefined) patch.watermarkUrl = watermarkUrl;
    if (watermarkPosition !== undefined) patch.watermarkPosition = watermarkPosition;
    if (watermarkOpacity !== undefined) patch.watermarkOpacity = String(watermarkOpacity);
    if (introBumperUrl !== undefined) patch.introBumperUrl = introBumperUrl;
    if (endCardTemplate !== undefined) patch.endCardTemplate = endCardTemplate;
    if (endCardText !== undefined) patch.endCardText = endCardText;
    const [updated] = await db.update(brandOverlayConfigsTable).set(patch)
      .where(and(eq(brandOverlayConfigsTable.id, Number(req.params.id)), eq(brandOverlayConfigsTable.userId, user.id)))
      .returning();
    if (!updated) { res.status(404).json({ error: "Config not found" }); return; }
    res.json(updated);
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed to update overlay config" }); }
});

// ─── Clip Performance ─────────────────────────────────────────────────────────
router.get("/clip-performance", ...requireClip, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    const { clipId, accountId } = req.query;
    const conditions = [eq(clipPerformanceLogsTable.userId, user.id)];
    if (clipId) conditions.push(eq(clipPerformanceLogsTable.clipId, Number(clipId)));
    if (accountId) conditions.push(eq(clipPerformanceLogsTable.accountId, Number(accountId)));
    const logs = await db.select().from(clipPerformanceLogsTable).where(and(...conditions)).orderBy(desc(clipPerformanceLogsTable.recordedAt));
    res.json(logs);
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed to fetch performance logs" }); }
});

router.post("/clip-performance", ...requireClip, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    const { clipId, accountId, views, shares, comments, saves, watchTimeSeconds, source } = req.body;
    if (!clipId || !accountId) { res.status(400).json({ error: "clipId and accountId required" }); return; }
    const [log] = await db.insert(clipPerformanceLogsTable).values({ userId: user.id, clipId, accountId, views: views ?? 0, shares: shares ?? 0, comments: comments ?? 0, saves: saves ?? 0, watchTimeSeconds: watchTimeSeconds ?? 0, source: source ?? "manual" }).returning();

    const score = Math.min(100, ((views ?? 0) * 0.4 + (shares ?? 0) * 1.5 + (saves ?? 0) * 2 + (comments ?? 0) * 1.2) / 10);
    await db.update(clipsTable).set({ performanceScore: String(score.toFixed(2)), updatedAt: new Date() })
      .where(and(eq(clipsTable.id, clipId), eq(clipsTable.userId, user.id)));

    res.status(201).json(log);
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed to log performance" }); }
});

router.get("/clip-performance/summary", ...requireClip, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    const logs = await db.select().from(clipPerformanceLogsTable).where(eq(clipPerformanceLogsTable.userId, user.id));
    const clips = await db.select().from(clipsTable).where(eq(clipsTable.userId, user.id)).orderBy(desc(clipsTable.performanceScore)).limit(10);

    const totals = logs.reduce((acc, l) => ({ views: acc.views + l.views, shares: acc.shares + l.shares, saves: acc.saves + l.saves, comments: acc.comments + l.comments, watchTime: acc.watchTime + l.watchTimeSeconds }), { views: 0, shares: 0, saves: 0, comments: 0, watchTime: 0 });

    const byFormat: Record<string, { count: number; avgScore: number }> = {};
    for (const c of clips) {
      if (!byFormat[c.format]) byFormat[c.format] = { count: 0, avgScore: 0 };
      byFormat[c.format].count++;
      byFormat[c.format].avgScore = (byFormat[c.format].avgScore + Number(c.performanceScore ?? 0)) / byFormat[c.format].count;
    }

    res.json({ totals, topClips: clips, byFormat, totalClips: clips.length });
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed to fetch performance summary" }); }
});

export default router;
