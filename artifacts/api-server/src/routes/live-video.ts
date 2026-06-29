import { Router } from "express";
import { Resend } from "resend";
import net, { isIP } from "node:net";
import dns from "node:dns/promises";
import { createHash } from "node:crypto";
import { db } from "@workspace/db";
import {
  liveSessionsTable,
  livePlatformConfigsTable,
  liveChatMessagesTable,
  liveRevenueEventsTable,
  postLiveClipsTable,
  liveReminderSignupsTable,
  liveModerationRulesTable,
  liveNotificationEventsTable,
  postsTable,
  usersTable,
} from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { requireAuth } from "./users";
import { requireTier } from "../middlewares/tierGuard";
import { getDbUserLiveApiKeys } from "./settings";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

const router = Router();
const requireLive = [requireAuth, requireTier("brand")];

async function getDbUser(clerkId: string) {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  return user ?? null;
}

// ─── Shared hype-schedule helper ─────────────────────────────────────────────
// Generates countdown posts into postsTable; returns the created post entries.
// Called automatically on session creation (countdownPostsEnabled=true) and
// manually via POST /live-sessions/:id/hype-schedule.
async function generateHypeSchedule(
  session: { id: number; title: string; scheduledAt: Date; platforms: unknown },
  userId: number
): Promise<Array<{ postId: number; platform: string; content: string; scheduledDate: string; hoursBeforeLive: number; platforms: string[] }>> {
  const liveDate = new Date(session.scheduledAt);
  const title = session.title;
  const sessionPlatforms = (session.platforms as string[]) ?? [];
  const platformList = sessionPlatforms.join(", ") || "social media";

  const templates: Array<{ hoursBeforeLive: number; platforms: string[]; caption: string; hashtags: string[] }> = [
    { hoursBeforeLive: 168, platforms: sessionPlatforms.length ? [sessionPlatforms[0]] : ["instagram"], caption: `🚨 LIVE IN 7 DAYS 🚨\n\n${title}\n\nJoin me LIVE on ${platformList} — mark your calendar and set a reminder. This one will be different.`, hashtags: ["#AreaFada", "#CharlyBoy", "#LiveNG"] },
    { hoursBeforeLive: 72, platforms: sessionPlatforms.length > 1 ? [sessionPlatforms[1]] : ["twitter"], caption: `72 hours to go. "${title}" — coming LIVE to your screen. Set a reminder. Bring your questions. I won't hold back.`, hashtags: ["#LiveNG", "#AreaFada"] },
    { hoursBeforeLive: 48, platforms: sessionPlatforms.length ? [sessionPlatforms[0]] : ["instagram"], caption: `48 hours. Here's a teaser of what we'll discuss LIVE: the things people are afraid to say out loud. "${title}" — ${liveDate.toLocaleDateString("en-NG", { weekday: "long", month: "short", day: "numeric" })} on ${platformList}. 🎙`, hashtags: ["#Teaser", "#AreaFada"] },
    { hoursBeforeLive: 24, platforms: sessionPlatforms.length ? [sessionPlatforms[0]] : ["instagram"], caption: `TOMORROW! 🔥 "${title}" goes LIVE in 24 hours. Everything is set. Are you ready? Drop a 🔴 below if you're coming through.`, hashtags: ["#AreaFada", "#LiveNG"] },
    { hoursBeforeLive: 6, platforms: sessionPlatforms.length > 1 ? [sessionPlatforms[1]] : ["twitter"], caption: `⏰ 6 HOURS. "${title}" is happening TONIGHT. Set your reminder RIGHT NOW. No excuses. I'll be waiting. 🎙`, hashtags: ["#LiveNG", "#CharlyBoy"] },
    { hoursBeforeLive: 1, platforms: sessionPlatforms.length ? [sessionPlatforms[0]] : ["instagram"], caption: `🔴 WE GO LIVE IN 1 HOUR!\n\n"${title}"\n\nGo to ${platformList} NOW and hit the notification bell. Don't be late!`, hashtags: ["#LiveNow", "#AreaFada"] },
    { hoursBeforeLive: 0.25, platforms: sessionPlatforms.length > 1 ? [sessionPlatforms[1]] : ["twitter"], caption: `🔴 LIVE IN 15 MINUTES — "${title}". Join me NOW on ${platformList}. This is the moment. 🎬`, hashtags: ["#LiveNow"] },
  ];

  const created: Array<{ postId: number; platform: string; content: string; scheduledDate: string; hoursBeforeLive: number; platforms: string[] }> = [];
  const now = new Date();
  for (const t of templates) {
    const scheduledAt = new Date(liveDate.getTime() - t.hoursBeforeLive * 3600 * 1000);
    if (scheduledAt <= now) continue;
    const [post] = await db.insert(postsTable).values({
      userId,
      caption: t.caption,
      platforms: t.platforms as any,
      hashtags: t.hashtags,
      mediaUrls: [],
      status: "scheduled",
      scheduledAt,
    }).returning({ id: postsTable.id });
    created.push({ postId: post.id, platform: t.platforms[0], content: t.caption, scheduledDate: scheduledAt.toISOString(), hoursBeforeLive: t.hoursBeforeLive, platforms: t.platforms });
  }
  return created;
}

function nanoid6() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

const PLATFORM_RTMP: Record<string, string> = {
  instagram: "rtmp://live-api-s.facebook.com:443/rtmp",
  youtube: "rtmp://a.rtmp.youtube.com/live2",
  facebook: "rtmp://live-api-s.facebook.com:443/rtmp",
  x: "rtmp://ingest.pscp.tv:443/x",
};

// ─── Seed demo data ─────────────────────────────────────────────────────────────
async function seedLiveData(userId: number) {
  const existing = await db.select().from(liveSessionsTable).where(eq(liveSessionsTable.userId, userId));
  if (existing.length > 0) return;

  const now = new Date();
  const upcoming = new Date(now.getTime() + 3 * 24 * 3600 * 1000);
  const past = new Date(now.getTime() - 5 * 24 * 3600 * 1000);
  const pastEnd = new Date(past.getTime() + 2 * 3600 * 1000);

  const [session1] = await db.insert(liveSessionsTable).values({
    userId,
    title: "999 Book Launch Live — Q&A with Charly Boy",
    description: "Join me LIVE as I celebrate the launch of my new book '999'. Ask your burning questions, get signed copies, and be part of history.",
    scheduledAt: upcoming,
    status: "scheduled",
    platforms: ["instagram", "youtube", "facebook"],
    peakViewers: 0,
    totalViewers: 0,
    countdownPostsEnabled: true,
    totalRevenue: "0",
  }).returning();

  const [session2] = await db.insert(liveSessionsTable).values({
    userId,
    title: "Area Fada Town Hall — Nigerian Youth & Politics",
    description: "Raw conversation about the state of Nigeria. No filter. No script. Just truth.",
    scheduledAt: past,
    endedAt: pastEnd,
    status: "ended",
    platforms: ["youtube", "instagram", "x"],
    peakViewers: 12400,
    totalViewers: 38200,
    countdownPostsEnabled: true,
    replayUrl: "https://youtube.com/watch?v=demo",
    totalRevenue: "485000",
  }).returning();

  // Platform configs for session 1
  await db.insert(livePlatformConfigsTable).values([
    { sessionId: session1.id, userId, platform: "instagram", streamKey: "DEMO-IG-" + nanoid6(), rtmpEndpoint: PLATFORM_RTMP.instagram, status: "ready" },
    { sessionId: session1.id, userId, platform: "youtube", streamKey: "DEMO-YT-" + nanoid6(), rtmpEndpoint: PLATFORM_RTMP.youtube, status: "ready" },
    { sessionId: session1.id, userId, platform: "facebook", streamKey: "DEMO-FB-" + nanoid6(), rtmpEndpoint: PLATFORM_RTMP.facebook, status: "pending" },
  ]);

  // Chat messages for session 2
  const chatMessages = [
    { platform: "instagram", authorName: "Nkechi_NG", authorHandle: "@nkechi_ng", message: "Baba! You are the voice we need right now! 🔥", isQuestion: false },
    { platform: "youtube", authorName: "EmekaSpeaks", authorHandle: "EmekaSpeaks", message: "What is your message to Nigerian youth who want to give up?", isQuestion: true },
    { platform: "facebook", authorName: "Aisha Bello", authorHandle: "AishaBello", message: "First time watching a live stream. This man is a legend!", isQuestion: false },
    { platform: "instagram", authorName: "ChidiVoice", authorHandle: "@chidivoice", message: "How do you deal with government pressure on creatives?", isQuestion: true, isPinned: true },
    { platform: "x", authorName: "femi_talks", authorHandle: "@femi_talks", message: "Super Chats incoming! Keep speaking the truth 💚", isQuestion: false },
    { platform: "youtube", authorName: "TrafficBot123", authorHandle: "TrafficBot123", message: "Subscribe to my channel!", isQuestion: false, isBanned: true },
  ];
  await db.insert(liveChatMessagesTable).values(
    chatMessages.map(m => ({ sessionId: session2.id, userId, ...m } as any))
  );

  // Revenue events
  await db.insert(liveRevenueEventsTable).values([
    { sessionId: session2.id, userId, platform: "youtube", eventType: "super_chat", senderName: "EmekaSpeaks", amount: "50000", currency: "NGN", message: "Speak your truth!" },
    { sessionId: session2.id, userId, platform: "instagram", eventType: "badge", senderName: "Nkechi_NG", amount: "25000", currency: "NGN" },
    { sessionId: session2.id, userId, platform: "facebook", eventType: "donation", senderName: "Aisha Bello", amount: "100000", currency: "NGN", message: "For the culture" },
    { sessionId: session2.id, userId, platform: "youtube", eventType: "super_chat", senderName: "ChidiVoice", amount: "75000", currency: "NGN", message: "Area Fada forever!" },
    { sessionId: session2.id, userId, platform: "youtube", eventType: "product_sale", senderName: "FanBuyer_1", amount: "4500", currency: "NGN", message: "Just bought 999 book" },
    { sessionId: session2.id, userId, platform: "youtube", eventType: "product_sale", senderName: "FanBuyer_2", amount: "4500", currency: "NGN" },
  ]);

  // Post-live clips
  await db.insert(postLiveClipsTable).values([
    { sessionId: session2.id, userId, label: "Opening Monologue — The Rebel's Code", startSeconds: 120, endSeconds: 300, aiCaption: "\"They said I was too much. I said not enough.\" This moment from Charly Boy's Town Hall is one for the archives. 🔥 #AreaFada #CharlyBoy #NigeriaYouth", platform: "instagram", status: "ready" },
    { sessionId: session2.id, userId, label: "Hot Take — Nigerian Politics", startSeconds: 1800, endSeconds: 2100, aiCaption: "Charly Boy says what nobody in Nigerian politics dares say out loud. Watch this clip before it disappears. 🇳🇬 #CharlyBoy #PoliticsNG", platform: "tiktok", status: "ready" },
    { sessionId: session2.id, userId, label: "Closing Message to Nigerian Youth", startSeconds: 6900, endSeconds: 7100, aiCaption: "\"Get up. Get loud. Get moving.\" If you needed a pep talk today, this is it. Charly Boy to Nigerian youth — direct and unfiltered. 💪", platform: "youtube", status: "queued" },
  ]);

  // Reminder signups for session 1
  await db.insert(liveReminderSignupsTable).values([
    { sessionId: session1.id, userId, fanName: "Precious Okafor", fanEmail: "precious@gmail.com", channel: "email", reminded: false },
    { sessionId: session1.id, userId, fanName: "Bayo Adeyemi", fanPhone: "+2348012345678", channel: "whatsapp", reminded: false },
    { sessionId: session1.id, userId, fanName: "Chidinma Eze", fanEmail: "chidinma@outlook.com", channel: "email", reminded: false },
    { sessionId: session1.id, userId, fanName: "Tunde Fashola", fanPhone: "+2349087654321", channel: "whatsapp", reminded: false },
  ]);
}

// ─── GET /live-sessions/:id/public (unauthenticated — fan page) ──────────────
router.get("/live-sessions/:id/public", async (req: any, res): Promise<void> => {
  try {
    const [session] = await db.select({
      id: liveSessionsTable.id,
      title: liveSessionsTable.title,
      description: liveSessionsTable.description,
      thumbnailUrl: liveSessionsTable.thumbnailUrl,
      scheduledAt: liveSessionsTable.scheduledAt,
      endedAt: liveSessionsTable.endedAt,
      status: liveSessionsTable.status,
      platforms: liveSessionsTable.platforms,
      replayUrl: liveSessionsTable.replayUrl,
      totalViewers: liveSessionsTable.totalViewers,
    }).from(liveSessionsTable).where(eq(liveSessionsTable.id, Number(req.params.id)));

    if (!session) { res.status(404).json({ error: "Session not found" }); return; }
    res.json(session);
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed to load session" }); }
});

// ─── GET /live-sessions ──────────────────────────────────────────────────────
router.get("/live-sessions", ...requireLive, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    let sessions = await db.select().from(liveSessionsTable)
      .where(eq(liveSessionsTable.userId, user.id))
      .orderBy(desc(liveSessionsTable.scheduledAt));

    if (sessions.length === 0 && process.env.NODE_ENV !== "production") {
      await seedLiveData(user.id);
      sessions = await db.select().from(liveSessionsTable)
        .where(eq(liveSessionsTable.userId, user.id))
        .orderBy(desc(liveSessionsTable.scheduledAt));
    }

    res.json(sessions);
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed to list sessions" }); }
});

// ─── POST /live-sessions ─────────────────────────────────────────────────────
router.post("/live-sessions", ...requireLive, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    const { title, description, thumbnailUrl, scheduledAt, platforms, countdownPostsEnabled } = req.body;
    if (!title || !scheduledAt) { res.status(400).json({ error: "title and scheduledAt required" }); return; }

    const [session] = await db.insert(liveSessionsTable).values({
      userId: user.id, title, description, thumbnailUrl,
      scheduledAt: new Date(scheduledAt),
      platforms: platforms ?? [],
      countdownPostsEnabled: countdownPostsEnabled ?? true,
    }).returning();

    // Auto-create platform configs
    if (platforms && platforms.length > 0) {
      await db.insert(livePlatformConfigsTable).values(
        platforms.map((p: string) => ({
          sessionId: session.id, userId: user.id, platform: p,
          streamKey: `${p.toUpperCase()}-${nanoid6()}`,
          rtmpEndpoint: PLATFORM_RTMP[p] ?? "rtmp://your-rtmp-server/live",
          status: "pending",
        }))
      );
    }

    // Auto-generate hype schedule when countdownPostsEnabled and session is in the future
    let hypePosts: Awaited<ReturnType<typeof generateHypeSchedule>> = [];
    if (session.countdownPostsEnabled && new Date(session.scheduledAt) > new Date()) {
      hypePosts = await generateHypeSchedule(session, user.id);
    }

    res.status(201).json({ ...session, hypePosts });
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed to create session" }); }
});

// ─── PATCH /live-sessions/:id ────────────────────────────────────────────────
router.patch("/live-sessions/:id", ...requireLive, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    const { title, description, scheduledAt, platforms, status, replayUrl, countdownPostsEnabled, peakViewers, totalViewers, totalRevenue } = req.body;
    const [updated] = await db.update(liveSessionsTable)
      .set({
        title, description, platforms,
        status, replayUrl, countdownPostsEnabled, peakViewers, totalViewers,
        totalRevenue: totalRevenue ? String(totalRevenue) : undefined,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
        endedAt: status === "ended" ? new Date() : undefined,
        updatedAt: new Date(),
      })
      .where(and(eq(liveSessionsTable.id, Number(req.params.id)), eq(liveSessionsTable.userId, user.id)))
      .returning();
    if (!updated) { res.status(404).json({ error: "Session not found" }); return; }
    res.json(updated);
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed to update session" }); }
});

// ─── DELETE /live-sessions/:id ───────────────────────────────────────────────
router.delete("/live-sessions/:id", ...requireLive, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    await db.delete(liveSessionsTable).where(and(eq(liveSessionsTable.id, Number(req.params.id)), eq(liveSessionsTable.userId, user.id)));
    res.status(204).end();
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed to delete session" }); }
});

// ─── GET /live-sessions/:id/platform-configs ─────────────────────────────────
router.get("/live-sessions/:id/platform-configs", ...requireLive, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    const configs = await db.select().from(livePlatformConfigsTable)
      .where(and(eq(livePlatformConfigsTable.sessionId, Number(req.params.id)), eq(livePlatformConfigsTable.userId, user.id)));
    res.json(configs);
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed to list configs" }); }
});

// ─── PATCH /live-sessions/:id/platform-configs/:platform ────────────────────
router.patch("/live-sessions/:id/platform-configs/:platform", ...requireLive, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    const { streamKey, broadcastUrl, status } = req.body;
    const [existing] = await db.select().from(livePlatformConfigsTable)
      .where(and(eq(livePlatformConfigsTable.sessionId, Number(req.params.id)), eq(livePlatformConfigsTable.platform, req.params.platform), eq(livePlatformConfigsTable.userId, user.id)));

    if (existing) {
      const [updated] = await db.update(livePlatformConfigsTable)
        .set({ streamKey, broadcastUrl, status })
        .where(eq(livePlatformConfigsTable.id, existing.id))
        .returning();
      res.json(updated);
    } else {
      const [created] = await db.insert(livePlatformConfigsTable).values({
        sessionId: Number(req.params.id), userId: user.id, platform: req.params.platform,
        streamKey, broadcastUrl, status: status ?? "pending",
        rtmpEndpoint: PLATFORM_RTMP[req.params.platform] ?? "rtmp://your-rtmp-server/live",
      }).returning();
      res.json(created);
    }
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed to update platform config" }); }
});

// ─── GET /live-sessions/:id/chat ─────────────────────────────────────────────
router.get("/live-sessions/:id/chat", ...requireLive, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    const messages = await db.select().from(liveChatMessagesTable)
      .where(and(eq(liveChatMessagesTable.sessionId, Number(req.params.id)), eq(liveChatMessagesTable.userId, user.id)))
      .orderBy(desc(liveChatMessagesTable.sentAt))
      .limit(200);
    res.json(messages);
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed to list chat" }); }
});

// ─── POST /live-sessions/:id/chat ────────────────────────────────────────────
router.post("/live-sessions/:id/chat", ...requireLive, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    const { platform, authorName, authorHandle, message, isQuestion } = req.body;
    if (!platform || !authorName || !message) { res.status(400).json({ error: "platform, authorName and message required" }); return; }
    const [created] = await db.insert(liveChatMessagesTable).values({
      sessionId: Number(req.params.id), userId: user.id, platform, authorName, authorHandle, message, isQuestion: isQuestion ?? false,
    }).returning();
    res.status(201).json(created);
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed to add message" }); }
});

// ─── PATCH /live-chat/:id ────────────────────────────────────────────────────
router.patch("/live-chat/:id", ...requireLive, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    const { isPinned, isBanned, isModerated, isQuestion } = req.body;
    const patch: Record<string, unknown> = {};
    if (isPinned !== undefined) patch.isPinned = isPinned;
    if (isBanned !== undefined) patch.isBanned = isBanned;
    if (isModerated !== undefined) patch.isModerated = isModerated;
    if (isQuestion !== undefined) patch.isQuestion = isQuestion;

    const [updated] = await db.update(liveChatMessagesTable)
      .set(patch)
      .where(and(eq(liveChatMessagesTable.id, Number(req.params.id)), eq(liveChatMessagesTable.userId, user.id)))
      .returning();

    if (!updated) { res.status(404).json({ error: "Message not found" }); return; }
    res.json(updated);
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed to update message" }); }
});

// ─── GET /live-sessions/:id/revenue ─────────────────────────────────────────
router.get("/live-sessions/:id/revenue", ...requireLive, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    const events = await db.select().from(liveRevenueEventsTable)
      .where(and(eq(liveRevenueEventsTable.sessionId, Number(req.params.id)), eq(liveRevenueEventsTable.userId, user.id)))
      .orderBy(desc(liveRevenueEventsTable.occurredAt));

    const totalRevenue = events.reduce((s, e) => s + Number(e.amount), 0);
    const byType: Record<string, number> = {};
    const byPlatform: Record<string, number> = {};
    for (const e of events) {
      byType[e.eventType] = (byType[e.eventType] ?? 0) + Number(e.amount);
      byPlatform[e.platform] = (byPlatform[e.platform] ?? 0) + Number(e.amount);
    }

    res.json({ events, totalRevenue, byType, byPlatform });
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed to get revenue" }); }
});

// ─── POST /live-sessions/:id/revenue ─────────────────────────────────────────
router.post("/live-sessions/:id/revenue", ...requireLive, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    const { platform, eventType, senderName, amount, currency, message } = req.body;
    if (!platform || !eventType || !senderName || amount == null) { res.status(400).json({ error: "platform, eventType, senderName and amount required" }); return; }
    const [created] = await db.insert(liveRevenueEventsTable).values({
      sessionId: Number(req.params.id), userId: user.id, platform, eventType, senderName, amount: String(amount), currency: currency ?? "NGN", message,
    }).returning();
    res.status(201).json(created);
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed to add revenue event" }); }
});

// ─── GET /live-sessions/:id/clips ────────────────────────────────────────────
router.get("/live-sessions/:id/clips", ...requireLive, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    const clips = await db.select().from(postLiveClipsTable)
      .where(and(eq(postLiveClipsTable.sessionId, Number(req.params.id)), eq(postLiveClipsTable.userId, user.id)))
      .orderBy(postLiveClipsTable.startSeconds);
    res.json(clips);
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed to list clips" }); }
});

// ─── POST /live-sessions/:id/clips ───────────────────────────────────────────
router.post("/live-sessions/:id/clips", ...requireLive, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    const { label, startSeconds, endSeconds, platform } = req.body;
    if (!label || startSeconds == null || endSeconds == null) { res.status(400).json({ error: "label, startSeconds and endSeconds required" }); return; }

    const [session] = await db.select().from(liveSessionsTable)
      .where(and(eq(liveSessionsTable.id, Number(req.params.id)), eq(liveSessionsTable.userId, user.id)));
    if (!session) { res.status(404).json({ error: "Session not found" }); return; }

    const durationSec = endSeconds - startSeconds;
    const mins = Math.floor(durationSec / 60);
    const aiCaption = `🎬 "${label}" — a ${mins}-minute moment from "${session.title}" that you cannot afford to miss. #AreaFada #CharlyBoy #NigeriaCreator`;

    const [created] = await db.insert(postLiveClipsTable).values({
      sessionId: Number(req.params.id), userId: user.id, label, startSeconds, endSeconds, platform, aiCaption, status: "ready",
    }).returning();
    res.status(201).json(created);
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed to add clip" }); }
});

// ─── DELETE /live-clips/:id ───────────────────────────────────────────────────
router.delete("/live-clips/:id", ...requireLive, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    await db.delete(postLiveClipsTable).where(and(eq(postLiveClipsTable.id, Number(req.params.id)), eq(postLiveClipsTable.userId, user.id)));
    res.status(204).end();
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed to delete clip" }); }
});

// ─── GET /live-sessions/:id/reminders ────────────────────────────────────────
router.get("/live-sessions/:id/reminders", ...requireLive, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    const signups = await db.select().from(liveReminderSignupsTable)
      .where(and(eq(liveReminderSignupsTable.sessionId, Number(req.params.id)), eq(liveReminderSignupsTable.userId, user.id)))
      .orderBy(desc(liveReminderSignupsTable.createdAt));
    res.json(signups);
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed to list reminders" }); }
});

// ─── POST /live-sessions/:id/reminders (public fan opt-in) ───────────────────
router.post("/live-sessions/:id/reminders", async (req: any, res): Promise<void> => {
  try {
    const { fanName, fanEmail, fanPhone, channel } = req.body;
    if (!fanName || (!fanEmail && !fanPhone)) { res.status(400).json({ error: "fanName and either fanEmail or fanPhone required" }); return; }
    const [session] = await db.select().from(liveSessionsTable).where(eq(liveSessionsTable.id, Number(req.params.id)));
    if (!session) { res.status(404).json({ error: "Session not found" }); return; }
    const [created] = await db.insert(liveReminderSignupsTable).values({
      sessionId: Number(req.params.id), userId: session.userId, fanName, fanEmail, fanPhone, channel: channel ?? (fanEmail ? "email" : "whatsapp"),
    }).returning();
    res.status(201).json({ message: "You're on the list! We'll remind you 1 hour before the session.", id: created.id });
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed to register reminder" }); }
});

// ─── POST /live-sessions/:id/send-reminders (admin triggers reminders) ───────
router.post("/live-sessions/:id/send-reminders", ...requireLive, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    const [session] = await db.select().from(liveSessionsTable)
      .where(and(eq(liveSessionsTable.id, Number(req.params.id)), eq(liveSessionsTable.userId, user.id)));
    if (!session) { res.status(404).json({ error: "Session not found" }); return; }

    const pending = await db.select().from(liveReminderSignupsTable)
      .where(and(eq(liveReminderSignupsTable.sessionId, Number(req.params.id)), eq(liveReminderSignupsTable.reminded, false)));

    const now = new Date();
    const liveDate = new Date(session.scheduledAt);
    const liveStr = liveDate.toLocaleDateString("en-NG", { weekday: "long", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });

    const results: Array<{ signupId: number; channel: string; recipient: string; status: string; messageId?: string; error?: string }> = [];

    for (const signup of pending) {
      const subject = `🔴 Going LIVE soon: "${session.title}"`;
      const emailBody = `Hey ${signup.fanName},\n\nJust a reminder — "${session.title}" goes LIVE on ${liveStr}.\n\nDon't be late! Set your alarm now.\n\n— Area Fada OS`;
      const htmlBody = `<p>Hey <strong>${signup.fanName}</strong>,</p><p>Just a reminder — <strong>"${session.title}"</strong> goes <strong>LIVE</strong> on <strong>${liveStr}</strong>.</p><p>Don't be late! Set your alarm now. 🎙</p><p>— Area Fada OS</p>`;
      const smsBody = `Hey ${signup.fanName}! 🔴 "${session.title}" goes LIVE on ${liveStr}. Don't miss it! — Area Fada OS`;

      let status = "queued";
      let providerMessageId: string | undefined;
      let errorMessage: string | undefined;

      if (signup.channel === "email" && signup.fanEmail) {
        if (resend) {
          try {
            const { data, error } = await resend.emails.send({
              from: "Area Fada OS <noreply@areafada.ng>",
              to: [signup.fanEmail],
              subject,
              text: emailBody,
              html: htmlBody,
            });
            if (error) { status = "failed"; errorMessage = error.message; }
            else { status = "sent"; providerMessageId = data?.id; }
          } catch (e: any) {
            status = "failed"; errorMessage = e.message;
          }
        } else {
          // RESEND_API_KEY not configured — log for manual send
          status = "queued";
          console.info(`[live-reminders] email queued (no RESEND_API_KEY): to=${signup.fanEmail} subject="${subject}"`);
        }
      } else if ((signup.channel === "whatsapp" || signup.channel === "sms") && signup.fanPhone) {
        // WhatsApp/SMS: persist as queued (wire Twilio/WhatsApp Business API to process queue)
        status = "queued";
        console.info(`[live-reminders] ${signup.channel} queued: to=${signup.fanPhone.slice(0, 7)}*** msg="${smsBody.slice(0, 60)}"`);
      }

      // Persist delivery event regardless of channel
      await db.insert(liveNotificationEventsTable).values({
        sessionId: session.id,
        userId: user.id,
        recipientId: signup.id,
        channel: signup.channel,
        recipient: signup.fanEmail ?? signup.fanPhone ?? "",
        subject,
        body: signup.channel === "email" ? emailBody : smsBody,
        status,
        providerMessageId,
        errorMessage,
        sentAt: status === "sent" ? now : undefined,
      });

      await db.update(liveReminderSignupsTable)
        .set({ reminded: true, remindedAt: now })
        .where(eq(liveReminderSignupsTable.id, signup.id));

      results.push({ signupId: signup.id, channel: signup.channel, recipient: (signup.fanEmail ?? signup.fanPhone ?? "").slice(0, 6) + "***", status, messageId: providerMessageId, error: errorMessage });
    }

    const sent = results.filter(r => r.status === "sent").length;
    const queued = results.filter(r => r.status === "queued").length;
    const failed = results.filter(r => r.status === "failed").length;

    res.json({
      message: `Reminders dispatched for ${pending.length} fans — ${sent} sent, ${queued} queued, ${failed} failed`,
      count: pending.length,
      breakdown: { sent, queued, failed },
      results,
    });
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed to send reminders" }); }
});

// ─── GET /live-sessions/:id/revenue.csv ──────────────────────────────────────
router.get("/live-sessions/:id/revenue.csv", ...requireLive, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    const [session] = await db.select().from(liveSessionsTable)
      .where(and(eq(liveSessionsTable.id, Number(req.params.id)), eq(liveSessionsTable.userId, user.id)));
    if (!session) { res.status(404).json({ error: "Session not found" }); return; }

    const events = await db.select().from(liveRevenueEventsTable)
      .where(and(eq(liveRevenueEventsTable.sessionId, Number(req.params.id)), eq(liveRevenueEventsTable.userId, user.id)))
      .orderBy(desc(liveRevenueEventsTable.occurredAt));

    const escape = (v: string | null | undefined) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const header = ["ID", "Platform", "Event Type", "Sender", "Amount (NGN)", "Currency", "Message", "Occurred At"];
    const rows = events.map(e => [
      e.id, e.platform, e.eventType, e.senderName, e.amount, e.currency, e.message ?? "", e.occurredAt.toISOString(),
    ].map(v => escape(String(v))).join(","));

    const csv = [header.join(","), ...rows].join("\r\n");
    const filename = `live-revenue-session-${session.id}-${new Date().toISOString().slice(0, 10)}.csv`;

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed to export revenue" }); }
});

// ─── POST /live-sessions/:id/queue-replay ────────────────────────────────────
router.post("/live-sessions/:id/queue-replay", ...requireLive, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    const [session] = await db.select().from(liveSessionsTable)
      .where(and(eq(liveSessionsTable.id, Number(req.params.id)), eq(liveSessionsTable.userId, user.id)));
    if (!session) { res.status(404).json({ error: "Session not found" }); return; }
    if (session.status !== "ended") { res.status(400).json({ error: "Session must be ended before queueing replay distribution" }); return; }

    const { replayUrl, platforms, distributeClips, chapters } = req.body;

    if (replayUrl) {
      await db.update(liveSessionsTable)
        .set({ replayUrl, updatedAt: new Date() })
        .where(eq(liveSessionsTable.id, session.id));
    }

    const activeReplayUrl: string | null = replayUrl ?? session.replayUrl;
    const targetPlatforms: string[] = platforms ?? (session.platforms as string[]);
    const chaptersBlock: string = Array.isArray(chapters) && chapters.length > 0
      ? "\n\nChapters:\n" + (chapters as Array<{ label: string; timestamp: string }>)
          .map(c => `${c.timestamp} — ${c.label}`).join("\n")
      : "";

    // Create a scheduled post in postsTable for each platform (replay announcement)
    const createdPosts: { id: number; platform: string }[] = [];
    const scheduleAt = new Date(Date.now() + 5 * 60 * 1000);
    for (const platform of targetPlatforms) {
      const caption = `🎬 Missed the LIVE? Watch the full replay of "${session.title}" now!\n\n${activeReplayUrl ?? "Link in bio"}${chaptersBlock}`;
      const [post] = await db.insert(postsTable).values({
        userId: user.id,
        caption,
        platforms: [platform] as any,
        hashtags: ["#Replay", "#AreaFada", "#LiveNG"],
        mediaUrls: [],
        status: "scheduled",
        scheduledAt: scheduleAt,
      }).returning({ id: postsTable.id });
      createdPosts.push({ id: post.id, platform });
    }

    // Queue clips as scheduled posts
    const clips = distributeClips
      ? await db.select().from(postLiveClipsTable)
          .where(and(eq(postLiveClipsTable.sessionId, session.id), eq(postLiveClipsTable.userId, user.id)))
      : [];

    const createdClipPosts: { id: number; clipId: number; platform: string }[] = [];
    for (const clip of clips) {
      if (!clip.platform || clip.status !== "ready") continue;
      const caption = clip.aiCaption ?? `Highlight from "${session.title}" 🎙`;
      const [clipPost] = await db.insert(postsTable).values({
        userId: user.id,
        caption,
        platforms: [clip.platform] as any,
        hashtags: ["#LiveHighlight", "#AreaFada"],
        mediaUrls: [],
        status: "scheduled",
        scheduledAt: new Date(scheduleAt.getTime() + 10 * 60 * 1000),
      }).returning({ id: postsTable.id });
      await db.update(postLiveClipsTable).set({ status: "queued" }).where(eq(postLiveClipsTable.id, clip.id));
      createdClipPosts.push({ id: clipPost.id, clipId: clip.id, platform: clip.platform });
    }

    res.json({
      message: `Replay distribution queued: ${createdPosts.length} replay post${createdPosts.length !== 1 ? "s" : ""}${createdClipPosts.length > 0 ? ` + ${createdClipPosts.length} clip post${createdClipPosts.length !== 1 ? "s" : ""}` : ""} added to the post scheduler`,
      replayPosts: createdPosts,
      clipPosts: createdClipPosts,
      sessionId: session.id,
    });
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed to queue replay" }); }
});

// ─── POST /live-sessions/:id/hype-schedule ───────────────────────────────────
router.post("/live-sessions/:id/hype-schedule", ...requireLive, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    const [session] = await db.select().from(liveSessionsTable)
      .where(and(eq(liveSessionsTable.id, Number(req.params.id)), eq(liveSessionsTable.userId, user.id)));
    if (!session) { res.status(404).json({ error: "Session not found" }); return; }

    const created = await generateHypeSchedule(session, user.id);
    res.json({
      message: `Hype schedule created — ${created.length} post${created.length !== 1 ? "s" : ""} added to the post scheduler`,
      posts: created,
      sessionId: Number(req.params.id),
    });
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed to generate hype schedule" }); }
});

// ─── Moderation Rules CRUD ────────────────────────────────────────────────────

// GET /live-moderation-rules — list all rules for current user
router.get("/live-moderation-rules", ...requireLive, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    const rules = await db.select().from(liveModerationRulesTable)
      .where(eq(liveModerationRulesTable.userId, user.id))
      .orderBy(desc(liveModerationRulesTable.createdAt));
    res.json(rules);
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed to fetch moderation rules" }); }
});

// POST /live-moderation-rules — create keyword filter or ban rule
router.post("/live-moderation-rules", ...requireLive, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    const { ruleType, pattern, action } = req.body;
    if (!pattern) { res.status(400).json({ error: "pattern is required" }); return; }
    const validTypes = ["keyword", "ban", "regex"];
    const validActions = ["hide", "delete", "flag", "timeout"];
    if (ruleType && !validTypes.includes(ruleType)) { res.status(400).json({ error: `ruleType must be one of: ${validTypes.join(", ")}` }); return; }
    if (action && !validActions.includes(action)) { res.status(400).json({ error: `action must be one of: ${validActions.join(", ")}` }); return; }
    const [rule] = await db.insert(liveModerationRulesTable).values({
      userId: user.id,
      ruleType: ruleType ?? "keyword",
      pattern,
      action: action ?? "hide",
    }).returning();
    res.status(201).json(rule);
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed to create moderation rule" }); }
});

// PATCH /live-moderation-rules/:id — toggle active, update action
router.patch("/live-moderation-rules/:id", ...requireLive, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    const { active, action, pattern } = req.body;
    const patch: Record<string, unknown> = {};
    if (active !== undefined) patch.active = active;
    if (action !== undefined) patch.action = action;
    if (pattern !== undefined) patch.pattern = pattern;
    if (Object.keys(patch).length === 0) { res.status(400).json({ error: "No fields to update" }); return; }
    const [updated] = await db.update(liveModerationRulesTable)
      .set(patch)
      .where(and(eq(liveModerationRulesTable.id, Number(req.params.id)), eq(liveModerationRulesTable.userId, user.id)))
      .returning();
    if (!updated) { res.status(404).json({ error: "Rule not found" }); return; }
    res.json(updated);
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed to update moderation rule" }); }
});

// DELETE /live-moderation-rules/:id
router.delete("/live-moderation-rules/:id", ...requireLive, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    const [deleted] = await db.delete(liveModerationRulesTable)
      .where(and(eq(liveModerationRulesTable.id, Number(req.params.id)), eq(liveModerationRulesTable.userId, user.id)))
      .returning();
    if (!deleted) { res.status(404).json({ error: "Rule not found" }); return; }
    res.status(204).end();
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed to delete moderation rule" }); }
});

// POST /live-chat/:id/check-moderation — run active rules against a message, apply action
router.post("/live-chat/:id/check-moderation", ...requireLive, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    const [message] = await db.select().from(liveChatMessagesTable)
      .where(and(eq(liveChatMessagesTable.id, Number(req.params.id)), eq(liveChatMessagesTable.userId, user.id)));
    if (!message) { res.status(404).json({ error: "Message not found" }); return; }
    const rules = await db.select().from(liveModerationRulesTable)
      .where(and(eq(liveModerationRulesTable.userId, user.id), eq(liveModerationRulesTable.active, true)));
    const text = message.message.toLowerCase();
    const triggered: Array<{ ruleId: number; pattern: string; action: string }> = [];
    for (const rule of rules) {
      const pattern = rule.pattern.toLowerCase();
      const matches = rule.ruleType === "regex"
        ? (() => { try { return new RegExp(rule.pattern, "i").test(message.message); } catch { return false; } })()
        : text.includes(pattern);
      if (matches) {
        triggered.push({ ruleId: rule.id, pattern: rule.pattern, action: rule.action });
        await db.update(liveModerationRulesTable)
          .set({ hitCount: rule.hitCount + 1 })
          .where(eq(liveModerationRulesTable.id, rule.id));
      }
    }
    // Apply the highest-severity action triggered
    const severityOrder = ["timeout", "delete", "flag", "hide"];
    const topAction = triggered.length > 0
      ? severityOrder.find(a => triggered.some(t => t.action === a)) ?? triggered[0].action
      : null;
    if (topAction === "hide" || topAction === "delete" || topAction === "flag") {
      await db.update(liveChatMessagesTable)
        .set({ isModerated: true })
        .where(eq(liveChatMessagesTable.id, message.id));
    }
    res.json({ triggered, topAction, messageId: message.id, message: triggered.length > 0 ? `${triggered.length} rule(s) triggered — action: ${topAction}` : "No rules triggered" });
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed to run moderation check" }); }
});

// ─── SSRF guard ──────────────────────────────────────────────────────────────
// Blocks outbound connections to private/link-local/internal IPs to prevent
// Server-Side Request Forgery. Applies to both TCP and WebSocket targets.
const PRIVATE_RANGES: RegExp[] = [
  /^127\./,                              // Loopback
  /^10\./,                               // RFC1918 class A
  /^172\.(1[6-9]|2\d|3[01])\./,        // RFC1918 class B
  /^192\.168\./,                         // RFC1918 class C
  /^169\.254\./,                         // Link-local
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, // CGNAT (RFC6598)
  /^0\.0\.0\.0$/,
  /^::1$/,                               // IPv6 loopback
  /^fc[0-9a-f]{2}:/i,                   // IPv6 ULA
  /^fd[0-9a-f]{2}:/i,                   // IPv6 ULA
  /^fe80:/i,                             // IPv6 link-local
  /^224\./,                              // Multicast
  /^240\./,                              // Reserved
];

const ALLOWED_RTMP_PORTS = new Set([1935, 443, 80]);

// OBS_WEBSOCKET_ALLOWED_HOSTS: comma-separated list of trusted hostnames/IPs that are
// permitted to bypass the private-IP SSRF guard for OBS WebSocket connections.
// Set by the operator (e.g. "192.168.1.100,studio-mac.local") for known OBS machines.
// Never expose this to end-users directly — it is a server-side admin config.
function getObsAllowedHosts(): Set<string> {
  const raw = process.env.OBS_WEBSOCKET_ALLOWED_HOSTS ?? "";
  return new Set(raw.split(",").map(s => s.trim().toLowerCase()).filter(Boolean));
}

async function checkSsrfSafe(hostname: string, port: number, allowedPorts?: Set<number>, skipPrivateCheck = false): Promise<{ safe: boolean; error?: string }> {
  if (allowedPorts && !allowedPorts.has(port)) {
    return { safe: false, error: `Port ${port} is not in the allowed list (${[...allowedPorts].join(", ")})` };
  }
  // If the hostname is in the operator-configured OBS allowlist, bypass private-IP check
  if (skipPrivateCheck) return { safe: true };

  const ips: string[] = [];
  if (isIP(hostname)) {
    ips.push(hostname);
  } else {
    try {
      const v4 = await dns.resolve4(hostname).catch(() => [] as string[]);
      const v6 = await dns.resolve6(hostname).catch(() => [] as string[]);
      ips.push(...v4, ...v6);
    } catch {
      return { safe: false, error: `DNS resolution failed for ${hostname}` };
    }
  }
  for (const ip of ips) {
    if (PRIVATE_RANGES.some(r => r.test(ip))) {
      return { safe: false, error: `Target ${hostname} resolves to a private/internal IP (${ip}). To allow this OBS host, add it to OBS_WEBSOCKET_ALLOWED_HOSTS on the server.` };
    }
  }
  if (ips.length === 0) return { safe: false, error: `No IPs resolved for ${hostname}` };
  return { safe: true };
}

// ─── TCP RTMP endpoint connectivity check ────────────────────────────────────
// Attempts a TCP connection to the RTMP host:port after SSRF validation.
// Returns reachable:true if the RTMP server accepts the connection.
async function testRtmpConnectivity(rtmpEndpoint: string, timeoutMs = 6000): Promise<{ reachable: boolean; latencyMs?: number; error?: string }> {
  let host: string;
  let port: number;
  try {
    if (!/^rtmps?:\/\//i.test(rtmpEndpoint)) {
      return { reachable: false, error: `RTMP endpoint must start with rtmp:// or rtmps://` };
    }
    const normalised = rtmpEndpoint.replace(/^rtmps?:\/\//i, "http://");
    const url = new URL(normalised);
    host = url.hostname;
    port = Number(url.port) || (rtmpEndpoint.toLowerCase().startsWith("rtmps") ? 443 : 1935);
  } catch {
    return { reachable: false, error: `Invalid RTMP endpoint format: ${rtmpEndpoint}` };
  }

  const ssrf = await checkSsrfSafe(host, port, ALLOWED_RTMP_PORTS);
  if (!ssrf.safe) return { reachable: false, error: ssrf.error };

  return new Promise(resolve => {
    const start = Date.now();
    const socket = net.createConnection({ host, port });

    const timer = setTimeout(() => {
      socket.destroy();
      resolve({ reachable: false, error: `TCP connection to ${host}:${port} timed out after ${timeoutMs}ms` });
    }, timeoutMs);

    socket.on("connect", () => {
      clearTimeout(timer);
      const latencyMs = Date.now() - start;
      socket.destroy();
      resolve({ reachable: true, latencyMs });
    });

    socket.on("error", err => {
      clearTimeout(timer);
      resolve({ reachable: false, error: `TCP error connecting to ${host}:${port}: ${err.message}` });
    });
  });
}

// ─── OBS WebSocket v5 StartStream trigger ────────────────────────────────────
// Connects to an OBS WebSocket endpoint (obs-websocket plugin v5+), authenticates
// using the OBS WebSocket challenge/response protocol, then sends StartStream.
// This is a real broadcast trigger — OBS will begin pushing the RTMP stream.
// Auth: secret=base64(SHA256(password+salt)); auth=base64(SHA256(secret+challenge))
async function triggerObsStartStream(obsWsUrl: string, obsWsPassword?: string): Promise<{ triggered: boolean; error?: string }> {
  // SSRF guard: validate the hostname before opening a WebSocket connection
  let obsHost: string;
  let obsPort: number;
  try {
    const parsed = new URL(obsWsUrl);
    if (!["ws:", "wss:"].includes(parsed.protocol)) {
      return { triggered: false, error: `OBS WebSocket URL must use ws:// or wss:// scheme` };
    }
    obsHost = parsed.hostname;
    obsPort = Number(parsed.port) || (parsed.protocol === "wss:" ? 443 : 80);
  } catch {
    return { triggered: false, error: `Invalid OBS WebSocket URL: ${obsWsUrl}` };
  }
  // OBS WS is typically on the creator's local machine. Operator-trusted hosts listed
  // in OBS_WEBSOCKET_ALLOWED_HOSTS bypass the private-IP SSRF guard; all others are checked.
  const allowedHosts = getObsAllowedHosts();
  const isAllowlisted = allowedHosts.has(obsHost.toLowerCase());
  const ssrf = await checkSsrfSafe(obsHost, obsPort, undefined, isAllowlisted);
  if (!ssrf.safe) return { triggered: false, error: `OBS WebSocket target rejected: ${ssrf.error}` };

  return new Promise(resolve => {
    let ws: any;
    const TIMEOUT_MS = 12000;
    let settled = false;

    const done = (result: { triggered: boolean; error?: string }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { ws?.close?.(); } catch {}
      resolve(result);
    };

    const timer = setTimeout(() => done({ triggered: false, error: "OBS WebSocket timed out" }), TIMEOUT_MS);

    try {
      // Use Node 18+ built-in WebSocket (globalThis.WebSocket or dynamic import)
      const WS = (globalThis as any).WebSocket;
      if (!WS) { done({ triggered: false, error: "WebSocket not available in this Node.js version" }); return; }
      ws = new WS(obsWsUrl);
    } catch (err: any) {
      done({ triggered: false, error: `OBS WebSocket connection failed: ${err.message}` });
      return;
    }

    ws.addEventListener("error", (e: any) => done({ triggered: false, error: `OBS WebSocket error: ${e?.message ?? "unknown"}` }));

    ws.addEventListener("message", (event: any) => {
      try {
        const msg = JSON.parse(event.data);
        const op: number = msg.op;
        const d = msg.d ?? {};

        if (op === 0) {
          // Hello — send Identify with optional auth
          const authData = d.authentication;
          let authentication: string | undefined;
          if (authData && obsWsPassword) {
            const secret = createHash("sha256").update(obsWsPassword + authData.salt).digest("base64");
            authentication = createHash("sha256").update(secret + authData.challenge).digest("base64");
          }
          ws.send(JSON.stringify({ op: 1, d: { rpcVersion: 1, ...(authentication ? { authentication } : {}) } }));
        } else if (op === 2) {
          // Identified — send StartStream request
          ws.send(JSON.stringify({ op: 6, d: { requestType: "StartStream", requestId: "areafada-go-live", requestData: {} } }));
        } else if (op === 7) {
          // RequestResponse — check if StartStream succeeded
          const status = d.requestStatus ?? {};
          if (status.result === true) {
            done({ triggered: true });
          } else {
            done({ triggered: false, error: `OBS rejected StartStream: ${status.comment ?? "already streaming or unknown error"}` });
          }
        }
      } catch (parseErr: any) {
        done({ triggered: false, error: `OBS WebSocket parse error: ${parseErr.message}` });
      }
    });
  });
}

// ─── Stream key format validators ────────────────────────────────────────────
// These perform structural/pattern validation without live API calls.
// YouTube keys are 4–5 dash-separated alphanumeric groups (e.g. xxxx-xxxx-xxxx-xxxx-xxxx)
// Facebook/Instagram keys are long alphanumeric strings (typically 30-80 chars)
// X/Twitter keys are alphanumeric (typically 20-40 chars)
function validateStreamKeyFormat(platform: string, key: string): { valid: boolean; message: string } {
  if (!key || key.trim().length === 0) {
    return { valid: false, message: "Stream key is empty" };
  }
  const k = key.trim();
  switch (platform) {
    case "youtube": {
      // YouTube stream keys: 4-5 groups of alphanumeric separated by dashes, e.g. abcd-efgh-ijkl-mnop or abcd-efgh-ijkl-mnop-qrst
      const ytPattern = /^[a-zA-Z0-9]{4,8}(-[a-zA-Z0-9]{4,8}){3,4}$/;
      if (ytPattern.test(k)) return { valid: true, message: "Format valid — matches YouTube stream key pattern" };
      // Also accept demo keys used in seeding
      if (k.startsWith("DEMO-YT-")) return { valid: true, message: "Demo key accepted" };
      return { valid: false, message: "YouTube stream keys follow the format xxxx-xxxx-xxxx-xxxx. Please copy it from YouTube Studio → Go Live → Stream." };
    }
    case "facebook":
    case "instagram": {
      // FB/IG: typically 30-80 alphanumeric chars, no strict pattern publicly documented
      if (k.length >= 10 && /^[a-zA-Z0-9_\-]+$/.test(k)) return { valid: true, message: "Format valid — matches Facebook/Instagram stream key pattern" };
      if (k.startsWith("DEMO-IG-") || k.startsWith("DEMO-FB-")) return { valid: true, message: "Demo key accepted" };
      return { valid: false, message: "Facebook/Instagram stream keys are alphanumeric strings (10+ characters). Copy from Live Producer in Meta Business Suite." };
    }
    case "x": {
      if (k.length >= 8 && /^[a-zA-Z0-9_\-]+$/.test(k)) return { valid: true, message: "Format valid — matches X stream key pattern" };
      if (k.startsWith("DEMO-X-")) return { valid: true, message: "Demo key accepted" };
      return { valid: false, message: "X (Twitter) stream keys are alphanumeric strings. Copy from twitter.com/i/broadcast." };
    }
    default:
      // Unknown platform — accept any non-empty key
      if (k.length >= 4) return { valid: true, message: "Key format accepted" };
      return { valid: false, message: "Stream key is too short" };
  }
}

// ─── POST /live-sessions/:id/validate-stream-keys ────────────────────────────
// Validates each platform config's stream key. Validation scope is explicitly:
//
// MODE A — Restream managed (RESTREAM_API_KEY configured):
//   Calls Restream API GET /v2/channel and verifies each platform has an enabled
//   destination channel. This is the authoritative API-backed check for Restream-
//   managed multi-streaming. Stream keys are managed by Restream; only the single
//   Restream RTMP ingest key is needed in OBS.
//
// MODE B — Direct RTMP (no Restream):
//   (1) Format validation — checks that the key matches the known structural
//   pattern for each platform (YouTube: dash-separated groups, etc.).
//   (2) TCP RTMP connectivity — opens a socket to the platform's RTMP host:port
//   to confirm the server is reachable. Both checks must pass for "validated".
//   NOTE: YouTube/Instagram/Facebook/X do not expose a public REST API endpoint
//   to validate stream keys without per-user OAuth 2.0. Scope is therefore
//   format + connectivity, not platform-account-level key authentication.
//   The validationType field in each result makes this explicit.
router.post("/live-sessions/:id/validate-stream-keys", ...requireLive, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    const [session] = await db.select().from(liveSessionsTable)
      .where(and(eq(liveSessionsTable.id, Number(req.params.id)), eq(liveSessionsTable.userId, user.id)));
    if (!session) { res.status(404).json({ error: "Session not found" }); return; }

    const configs = await db.select().from(livePlatformConfigsTable)
      .where(and(eq(livePlatformConfigsTable.sessionId, Number(req.params.id)), eq(livePlatformConfigsTable.userId, user.id)));

    if (configs.length === 0) {
      res.status(422).json({ error: "No platform configs found for this session. Add platforms when creating the session." });
      return;
    }

    // ── Restream destination verification (real API check) ───────────────────
    // When RESTREAM_API_KEY is set, fetch all configured Restream channels and
    // match each platform config against them. This is a live API-backed check.
    type RestreamChannel = { id: number; displayName: string; enabled: boolean; type: { id: number; name: string } };
    let restreamChannels: RestreamChannel[] | null = null;
    let restreamApiReachable = false;
    let restreamApiError: string | null = null;

    if (process.env.RESTREAM_API_KEY) {
      try {
        const channelsRes = await fetch("https://api.restream.io/v2/channel", {
          headers: { Authorization: `Bearer ${process.env.RESTREAM_API_KEY}` },
        });
        if (channelsRes.ok) {
          restreamChannels = (await channelsRes.json()) as RestreamChannel[];
          restreamApiReachable = true;
        } else {
          const errText = await channelsRes.text().catch(() => "");
          restreamApiError = `Restream API returned ${channelsRes.status}: ${errText.slice(0, 120)}`;
        }
      } catch (rstEx: any) {
        restreamApiError = `Restream API unreachable: ${rstEx.message}`;
      }

      if (!restreamApiReachable) {
        // Fail the validation entirely if Restream is configured but unreachable
        res.status(502).json({
          error: "Restream API is configured but could not be reached. Check RESTREAM_API_KEY and Restream service status.",
          detail: restreamApiError,
        });
        return;
      }
    }

    // Normalize Restream channel type names to our platform keys
    const RESTREAM_PLATFORM_MAP: Record<string, string> = {
      youtube: "youtube", "youtube live": "youtube",
      instagram: "instagram", "instagram live": "instagram",
      facebook: "facebook", "facebook live": "facebook",
      x: "x", twitter: "x", periscope: "x",
      tiktok: "tiktok", "tiktok live": "tiktok",
    };

    const results: Array<{
      platform: string; configId: number; valid: boolean; message: string;
      newStatus: string; validationType: "restream_api" | "format_only";
      restreamChannelId?: number;
    }> = [];
    const now = new Date();

    for (const cfg of configs) {
      let valid = false;
      let message = "";
      let validationType: "restream_api" | "format_only" = "format_only";
      let matchedRestreamChannelId: number | undefined;

      if (restreamChannels !== null) {
        // ── Real Restream API validation ────────────────────────────────────
        // Find a Restream channel matching this platform that is enabled
        const match = restreamChannels.find(ch => {
          const chPlatform = RESTREAM_PLATFORM_MAP[ch.type?.name?.toLowerCase() ?? ""] ?? ch.type?.name?.toLowerCase();
          return chPlatform === cfg.platform;
        });

        if (match) {
          valid = match.enabled;
          matchedRestreamChannelId = match.id;
          message = match.enabled
            ? `Restream destination verified: "${match.displayName}" (channel ${match.id}) is active`
            : `Restream destination "${match.displayName}" exists but is disabled — enable it in Restream dashboard`;
          validationType = "restream_api";
        } else {
          valid = false;
          message = `No Restream channel found for ${cfg.platform}. Add ${cfg.platform} as a destination in your Restream dashboard (restream.io/dashboard).`;
          validationType = "restream_api";
        }
      } else {
        // ── Format + TCP connectivity validation (no Restream configured) ───
        // Step 1: format check
        const fmt = validateStreamKeyFormat(cfg.platform, cfg.streamKey ?? "");
        // Step 2: TCP RTMP endpoint connectivity check
        let tcpCheck: Awaited<ReturnType<typeof testRtmpConnectivity>> = { reachable: false, error: "No RTMP endpoint configured" };
        if (cfg.rtmpEndpoint) {
          tcpCheck = await testRtmpConnectivity(cfg.rtmpEndpoint);
        }

        if (!fmt.valid) {
          valid = false;
          message = `${fmt.message}`;
          validationType = "format_only";
        } else if (!tcpCheck.reachable) {
          // Format ok but server unreachable — surface as warning (connectivity issue, not key issue)
          valid = false;
          message = `Stream key format valid, but RTMP server unreachable: ${tcpCheck.error ?? "connection failed"}. Check your network or the endpoint.`;
          validationType = "format_only";
        } else {
          valid = true;
          message = `Stream key format valid + RTMP server reachable (${tcpCheck.latencyMs}ms). Enter this key in OBS to broadcast.`;
          validationType = "format_only";
        }
      }

      const newStatus = valid ? "validated" : "invalid";
      await db.update(livePlatformConfigsTable)
        .set({
          status: newStatus,
          validatedAt: valid ? now : undefined,
          ...(matchedRestreamChannelId != null ? { restreamChannelId: String(matchedRestreamChannelId) } : {}),
        } as any)
        .where(eq(livePlatformConfigsTable.id, cfg.id));

      results.push({ platform: cfg.platform, configId: cfg.id, valid, message, newStatus, validationType, restreamChannelId: matchedRestreamChannelId });
    }

    const allValid = results.every(r => r.valid);
    const validCount = results.filter(r => r.valid).length;
    const apiBackedCheck = results.some(r => r.validationType === "restream_api");

    res.json({
      allValid,
      validationType: apiBackedCheck ? "restream_api" : "format_only",
      message: allValid
        ? `All ${validCount} platform stream keys validated successfully — ready to go live`
        : `${validCount}/${results.length} stream keys valid. Fix the invalid ones before going live.`,
      results,
    });
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed to validate stream keys" }); }
});

// ─── POST /live-sessions/:id/go-live ─────────────────────────────────────────
// Starts a live broadcast. Enforces server-side preconditions, then either:
//  A) Configures Restream broadcast title via API (if RESTREAM_API_KEY set) and
//     provides the single Restream RTMP endpoint + stream key for OBS — Restream
//     fans out to all configured destination channels automatically.
//  B) Provides individual per-platform RTMP endpoints + keys for OBS multi-rtmp plugin.
// Session status is only set to "live" after preconditions are confirmed.
router.post("/live-sessions/:id/go-live", ...requireLive, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    const [session] = await db.select().from(liveSessionsTable)
      .where(and(eq(liveSessionsTable.id, Number(req.params.id)), eq(liveSessionsTable.userId, user.id)));
    if (!session) { res.status(404).json({ error: "Session not found" }); return; }
    if (session.status === "live") { res.status(409).json({ error: "Session is already live" }); return; }
    if (session.status === "ended") { res.status(400).json({ error: "Cannot go live on an ended session" }); return; }

    const configs = await db.select().from(livePlatformConfigsTable)
      .where(and(eq(livePlatformConfigsTable.sessionId, Number(req.params.id)), eq(livePlatformConfigsTable.userId, user.id)));

    // ── Server-side precondition: require at least one VALIDATED config ────────
    // Only "validated" status (set by POST /validate-stream-keys) unlocks go-live.
    // "ready" is no longer accepted as a bypass — validation must be explicitly run.
    const validatedConfigs = configs.filter(c => c.status === "validated");
    if (validatedConfigs.length === 0) {
      res.status(422).json({
        error: "Cannot go live: no platform stream keys have been validated. Run POST /live-sessions/:id/validate-stream-keys first to confirm stream connectivity, then retry go-live.",
        currentStatuses: configs.map(c => ({ platform: c.platform, status: c.status })),
        hint: "Platforms with status 'ready' do not satisfy this gate — run validate-stream-keys to promote them to 'validated'.",
      });
      return;
    }

    // ── OBS WebSocket broadcast trigger ──────────────────────────────────────
    // If the creator provides their OBS WebSocket endpoint, we connect to OBS
    // and send a StartStream request via the OBS WebSocket v5 protocol.
    // This is a real, direct broadcast trigger: OBS will start pushing RTMP.
    // If OBS WS is provided and the trigger fails, go-live is aborted to prevent
    // a false "live" state without an active broadcast.
    const obsWsUrl: string | undefined = req.body.obsWebSocketUrl ?? process.env.OBS_WEBSOCKET_URL;
    const obsWsPassword: string | undefined = req.body.obsWebSocketPassword ?? process.env.OBS_WEBSOCKET_PASSWORD;
    let obsResult: { triggered: boolean; attempted: boolean; error?: string } = { triggered: false, attempted: false };

    if (obsWsUrl) {
      obsResult.attempted = true;
      const wsResult = await triggerObsStartStream(obsWsUrl, obsWsPassword);
      obsResult = { attempted: true, ...wsResult };
      if (!wsResult.triggered) {
        // Trigger was attempted but failed — abort to prevent false live state
        console.warn(`[go-live] OBS WebSocket StartStream failed: ${wsResult.error}`);
        res.status(502).json({
          error: "OBS WebSocket StartStream failed — broadcast was not started. Session state unchanged.",
          detail: wsResult.error,
          obs: obsResult,
        });
        return;
      }
      console.info(`[go-live] OBS WebSocket StartStream triggered successfully`);
    }

    // ── Restream API integration ──────────────────────────────────────────────
    // When RESTREAM_API_KEY is set:
    //   1. Verify the API key is active by fetching the user profile
    //   2. Update the broadcast title so platforms show the correct session name
    //   3. Return the single Restream RTMP endpoint + stream key for OBS
    // Restream starts the fan-out automatically when OBS pushes to the RTMP endpoint.
    let restreamResult: {
      connected: boolean; message: string;
      obsServer?: string; obsStreamKey?: string;
    } = { connected: false, message: "Restream not configured — push directly to each platform using the RTMP endpoints below (set RESTREAM_API_KEY to enable single-feed multi-streaming)" };

    if (process.env.RESTREAM_API_KEY) {
      // Step 1: Verify API key via profile fetch
      let apiKeyValid = false;
      let restreamStreamKey: string | undefined;
      try {
        const profileRes = await fetch("https://api.restream.io/v2/user/profile", {
          headers: { Authorization: `Bearer ${process.env.RESTREAM_API_KEY}` },
        });
        if (profileRes.ok) {
          const profile = (await profileRes.json().catch(() => ({}))) as Record<string, any>;
          apiKeyValid = true;
          restreamStreamKey = profile.streamKey ?? profile.streamKeyInfo?.streamKey;
        } else {
          const profileErr = await profileRes.text().catch(() => "");
          restreamResult = { connected: false, message: `Restream API key invalid or expired (${profileRes.status}): ${profileErr.slice(0, 100)}` };
        }
      } catch (profEx: any) {
        restreamResult = { connected: false, message: `Restream API unreachable: ${profEx.message}` };
      }

      if (!apiKeyValid) {
        // Restream is configured but we can't verify the key — block go-live
        res.status(502).json({
          error: "Restream API key is configured but could not be verified. Fix RESTREAM_API_KEY or remove it to fall back to direct OBS streaming.",
          restream: restreamResult,
        });
        return;
      }

      // Step 2: Update broadcast title on Restream
      try {
        const metaRes = await fetch("https://api.restream.io/v2/broadcast-meta", {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${process.env.RESTREAM_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ title: session.title }),
        });
        // Title update is best-effort — don't fail go-live if it doesn't work
        if (!metaRes.ok) {
          console.warn(`[go-live] Restream broadcast-meta PATCH returned ${metaRes.status} — continuing`);
        }
      } catch (metaEx: any) {
        console.warn("[go-live] Restream broadcast-meta update failed:", metaEx.message);
      }

      restreamResult = {
        connected: true,
        message: "Restream connected — push your OBS stream to the Restream RTMP endpoint below. Restream will fan out to all configured destinations automatically.",
        obsServer: "rtmp://live.restream.io/live",
        obsStreamKey: restreamStreamKey,
      };
    }

    // ── Two-phase broadcast state machine ────────────────────────────────────
    // PHASE 1 (go-live): validate trigger path, issue credentials, transition to `armed`
    //   - OBS WS path: StartStream is confirmed successful → jump directly to `live`
    //   - Restream path: API verified, title updated → set to `armed` (RTMP ingest ready,
    //     waiting for OBS to start pushing). Creator must call confirm-live after OBS starts.
    //   - No trigger configured → 422 (prevents false-live state)
    // PHASE 2 (confirm-live): creator confirms OBS is actively pushing → set to `live`
    //
    // This prevents the session ever showing as `live` before media is actually flowing.
    const hasRestreamTrigger = restreamResult.connected;
    const hasObsTrigger = obsResult.triggered;

    if (!hasRestreamTrigger && !hasObsTrigger) {
      res.status(422).json({
        error: "No broadcast trigger is configured. Set RESTREAM_API_KEY for Restream multi-streaming, or provide 'obsWebSocketUrl' (with OBS_WEBSOCKET_ALLOWED_HOSTS set on the server for local OBS) to trigger OBS StartStream directly.",
        restream: restreamResult,
        obs: obsResult,
      });
      return;
    }

    // OBS WS triggered successfully → stream is confirmed flowing → go directly to `live`
    // Restream verified → set to `armed` — OBS credentials are ready but OBS hasn't pushed yet
    const nextStatus = hasObsTrigger ? "live" : "armed";
    const now = new Date();
    const [updatedSession] = await db.update(liveSessionsTable)
      .set({ status: nextStatus, updatedAt: now })
      .where(eq(liveSessionsTable.id, session.id))
      .returning();

    // Mark validated configs with appropriate status
    for (const cfg of validatedConfigs) {
      await db.update(livePlatformConfigsTable)
        .set({ status: nextStatus === "live" ? "live" : "ready" })
        .where(eq(livePlatformConfigsTable.id, cfg.id));
    }

    // Build per-platform OBS config (for direct OBS multi-rtmp mode or reference)
    const streamConfigs = configs.map(cfg => ({
      platform: cfg.platform,
      rtmpEndpoint: cfg.rtmpEndpoint,
      streamKey: cfg.streamKey,
      status: validatedConfigs.some(r => r.id === cfg.id) ? nextStatus : cfg.status,
      obsSetup: `Server: ${cfg.rtmpEndpoint}  |  Key: ${cfg.streamKey ?? "(not set)"}`,
      included: validatedConfigs.some(r => r.id === cfg.id),
    }));

    console.info(`[go-live] Session ${session.id} "${session.title}" → ${nextStatus} | restream: ${restreamResult.connected} | obsTriggered: ${obsResult.triggered}`);

    res.json({
      message: hasObsTrigger
        ? "Session is now LIVE — OBS StartStream confirmed via WebSocket. Media is flowing."
        : "Session is ARMED — RTMP credentials issued. Start OBS streaming now, then call confirm-live to mark session as live.",
      phase: nextStatus === "live" ? "live" : "armed",
      session: updatedSession,
      streamConfigs,
      restream: restreamResult,
      obs: obsResult,
      obsInstructions: restreamResult.connected
        ? {
            mode: "restream",
            summary: "In OBS: Settings → Stream → Custom → Server: rtmp://live.restream.io/live → Stream Key: your Restream key → Start Streaming. Restream fans out to all destinations automatically.",
            server: restreamResult.obsServer,
            streamKey: restreamResult.obsStreamKey,
          }
        : {
            mode: "direct_multi_rtmp",
            summary: "In OBS: install the obs-multi-rtmp plugin, then add one output per platform using the RTMP endpoints and keys above. Start all outputs simultaneously.",
            pluginUrl: "https://github.com/sorayuki/obs-multi-rtmp",
            targets: streamConfigs.filter(c => c.included).map(c => ({ platform: c.platform, server: c.rtmpEndpoint, key: c.streamKey })),
          },
    });
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed to go live" }); }
});

// ─── POST /live-sessions/:id/confirm-live ────────────────────────────────────
// Phase 2 of the two-phase go-live flow (for Restream path).
// After go-live returns phase="armed" and the creator starts OBS, they call this
// endpoint to confirm OBS is actively pushing → session transitions from "armed" to "live".
// For OBS WS path, go-live already sets "live" directly — confirm-live is a no-op.
router.post("/live-sessions/:id/confirm-live", ...requireLive, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    const [session] = await db.select().from(liveSessionsTable)
      .where(and(eq(liveSessionsTable.id, Number(req.params.id)), eq(liveSessionsTable.userId, user.id)));
    if (!session) { res.status(404).json({ error: "Session not found" }); return; }

    if (session.status === "live") {
      res.json({ message: "Session is already live", session, alreadyLive: true });
      return;
    }
    if (session.status !== "armed") {
      res.status(400).json({
        error: `Cannot confirm live: session status is '${session.status}'. Call go-live first to arm the session.`,
        currentStatus: session.status,
      });
      return;
    }

    const now = new Date();
    const [updatedSession] = await db.update(liveSessionsTable)
      .set({ status: "live", updatedAt: now })
      .where(eq(liveSessionsTable.id, session.id))
      .returning();

    // Promote platform configs from ready → live
    await db.update(livePlatformConfigsTable)
      .set({ status: "live" })
      .where(and(
        eq(livePlatformConfigsTable.sessionId, session.id),
        eq(livePlatformConfigsTable.userId, user.id),
      ));

    console.info(`[confirm-live] Session ${session.id} "${session.title}" confirmed LIVE by user ${user.id}`);

    res.json({
      message: "Session is now LIVE — broadcast confirmed. Viewer stats will update via the viewer-count endpoint.",
      session: updatedSession,
    });
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed to confirm live" }); }
});

// ─── POST /live-sessions/:id/end-stream ──────────────────────────────────────
// Marks the session as ended, updates viewer stats, and notifies Restream API.
router.post("/live-sessions/:id/end-stream", ...requireLive, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    const [session] = await db.select().from(liveSessionsTable)
      .where(and(eq(liveSessionsTable.id, Number(req.params.id)), eq(liveSessionsTable.userId, user.id)));
    if (!session) { res.status(404).json({ error: "Session not found" }); return; }
    if (session.status === "ended") { res.status(409).json({ error: "Session has already ended" }); return; }

    const { totalViewers, peakViewers } = req.body;
    const now = new Date();

    const [updatedSession] = await db.update(liveSessionsTable)
      .set({
        status: "ended",
        endedAt: now,
        updatedAt: now,
        ...(totalViewers != null ? { totalViewers: Number(totalViewers) } : {}),
        ...(peakViewers != null ? { peakViewers: Number(peakViewers) } : {}),
      })
      .where(eq(liveSessionsTable.id, session.id))
      .returning();

    // Mark all live platform configs as ended
    await db.update(livePlatformConfigsTable)
      .set({ status: "ended" })
      .where(and(eq(livePlatformConfigsTable.sessionId, session.id), eq(livePlatformConfigsTable.userId, user.id)));

    // Notify Restream API to stop broadcast if configured
    let restreamResult: { connected: boolean; message: string } = { connected: false, message: "Restream not configured" };
    if (process.env.RESTREAM_API_KEY) {
      try {
        // Restream API v2: PATCH /broadcast to signal end
        const rstRes = await fetch("https://api.restream.io/v2/broadcast/end", {
          method: "POST",
          headers: { Authorization: `Bearer ${process.env.RESTREAM_API_KEY}` },
        });
        restreamResult = rstRes.ok
          ? { connected: true, message: "Restream broadcast ended" }
          : { connected: false, message: `Restream responded: ${rstRes.status}` };
      } catch (rstEx: any) {
        restreamResult = { connected: false, message: `Restream error: ${rstEx.message}` };
      }
    }

    console.info(`[end-stream] Session ${session.id} "${session.title}" ended — viewers: ${updatedSession.totalViewers}`);

    res.json({
      message: "Session ended successfully",
      session: updatedSession,
      restream: restreamResult,
    });
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed to end stream" }); }
});

// ─── GET /live-sessions/:id/viewer-count ─────────────────────────────────────
// Fetches live viewer counts from platform APIs (YouTube if configured) and
// returns aggregated totals. Updates session peakViewers if exceeded.
router.get("/live-sessions/:id/viewer-count", ...requireLive, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    const [session] = await db.select().from(liveSessionsTable)
      .where(and(eq(liveSessionsTable.id, Number(req.params.id)), eq(liveSessionsTable.userId, user.id)));
    if (!session) { res.status(404).json({ error: "Session not found" }); return; }

    const configs = await db.select().from(livePlatformConfigsTable)
      .where(and(eq(livePlatformConfigsTable.sessionId, Number(req.params.id)), eq(livePlatformConfigsTable.userId, user.id)));

    const platformCounts: Record<string, { viewers: number; source: string }> = {};

    // Resolve API keys: env var takes priority, then fall back to per-user DB value
    const dbKeys = await getDbUserLiveApiKeys(user.id);
    const youtubeApiKey = process.env.YOUTUBE_API_KEY || dbKeys.youtubeApiKey;
    const instagramAccessToken = process.env.INSTAGRAM_ACCESS_TOKEN || dbKeys.instagramAccessToken;

    // YouTube Live viewer count via YouTube Data API v3
    if (youtubeApiKey) {
      const ytConfig = configs.find(c => c.platform === "youtube");
      if (ytConfig && ytConfig.broadcastUrl) {
        // Extract video ID from broadcast URL if possible
        const ytVideoIdMatch = ytConfig.broadcastUrl.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
        const videoId = ytVideoIdMatch?.[1];
        if (videoId) {
          try {
            const ytUrl = `https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails&id=${videoId}&key=${youtubeApiKey}`;
            const ytRes = await fetch(ytUrl);
            if (ytRes.ok) {
              const ytData = (await ytRes.json()) as Record<string, any>;
              const item = ytData.items?.[0];
              const concurrent = Number(item?.liveStreamingDetails?.concurrentViewers ?? 0);
              platformCounts["youtube"] = { viewers: concurrent, source: "youtube_api" };
              await db.update(livePlatformConfigsTable)
                .set({ currentViewers: concurrent } as any)
                .where(eq(livePlatformConfigsTable.id, ytConfig.id));
            }
          } catch (ytErr: any) {
            console.warn("[viewer-count] YouTube API error:", ytErr.message);
          }
        }
      }
    }

    // Instagram Live viewer count via Instagram Graph API
    if (instagramAccessToken) {
      const igConfig = configs.find(c => c.platform === "instagram");
      if (igConfig && igConfig.broadcastUrl) {
        const igMediaIdMatch = igConfig.broadcastUrl.match(/\/(\d+)\/?$/);
        const mediaId = igMediaIdMatch?.[1];
        if (mediaId) {
          try {
            const igUrl = `https://graph.instagram.com/${mediaId}?fields=live_status,viewer_count&access_token=${instagramAccessToken}`;
            const igRes = await fetch(igUrl);
            if (igRes.ok) {
              const igData = (await igRes.json()) as Record<string, any>;
              const viewers = Number(igData.viewer_count ?? 0);
              platformCounts["instagram"] = { viewers, source: "instagram_api" };
              await db.update(livePlatformConfigsTable)
                .set({ currentViewers: viewers } as any)
                .where(eq(livePlatformConfigsTable.id, igConfig.id));
            }
          } catch (igErr: any) {
            console.warn("[viewer-count] Instagram API error:", igErr.message);
          }
        }
      }
    }

    // For platforms without API keys configured, use stored currentViewers from DB
    for (const cfg of configs) {
      if (!platformCounts[cfg.platform]) {
        platformCounts[cfg.platform] = {
          viewers: (cfg as any).currentViewers ?? 0,
          source: "last_known",
        };
      }
    }

    const totalViewers = Object.values(platformCounts).reduce((s, p) => s + p.viewers, 0);

    // Update session peakViewers if this count exceeds current peak
    if (totalViewers > session.peakViewers) {
      await db.update(liveSessionsTable)
        .set({ peakViewers: totalViewers, updatedAt: new Date() })
        .where(eq(liveSessionsTable.id, session.id));
    }

    // Also update totalViewers on the session during a live session
    if (session.status === "live") {
      await db.update(liveSessionsTable)
        .set({ totalViewers: Math.max(session.totalViewers, totalViewers), updatedAt: new Date() })
        .where(eq(liveSessionsTable.id, session.id));
    }

    const apiKeysConfigured = {
      youtube: !!process.env.YOUTUBE_API_KEY,
      instagram: !!process.env.INSTAGRAM_ACCESS_TOKEN,
      restream: !!process.env.RESTREAM_API_KEY,
    };

    res.json({
      sessionId: session.id,
      totalViewers,
      peakViewers: Math.max(session.peakViewers, totalViewers),
      platforms: platformCounts,
      apiKeysConfigured,
      note: Object.values(apiKeysConfigured).every(v => !v)
        ? "No platform API keys configured. Set YOUTUBE_API_KEY and/or INSTAGRAM_ACCESS_TOKEN to fetch real viewer counts."
        : undefined,
    });
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed to fetch viewer counts" }); }
});

// GET /live-notification-events — delivery log for current user's sessions
router.get("/live-notification-events", ...requireLive, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    const { sessionId } = req.query;
    const conditions = [eq(liveNotificationEventsTable.userId, user.id)];
    if (sessionId) conditions.push(eq(liveNotificationEventsTable.sessionId, Number(sessionId)));
    const events = await db.select().from(liveNotificationEventsTable)
      .where(and(...conditions))
      .orderBy(desc(liveNotificationEventsTable.createdAt))
      .limit(200);
    res.json(events);
  } catch (err) { console.error(err); res.status(500).json({ error: "Failed to fetch notification events" }); }
});

export default router;
