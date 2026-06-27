import { Router } from "express";
import { Resend } from "resend";
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
