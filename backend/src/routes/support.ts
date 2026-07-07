import { Router } from "express";
import { db } from "@workspace/db";
import {
  supportConversationsTable,
  supportMessagesTable,
  usersTable,
} from "@workspace/db";
import { eq, desc, and, ilike, or, sql } from "drizzle-orm";
import { requireAuth } from "./users";

const router = Router();

const PLATFORMS = ["whatsapp", "instagram", "tiktok", "x", "email", "linkedin"] as const;

// ─── Seed realistic demo conversations ────────────────────────────────────────
const DEMO_CONVERSATIONS: {
  platform: string;
  contactName: string;
  contactHandle: string;
  status: string;
  priority: string;
  messages: { direction: string; content: string; minutesAgo: number }[];
}[] = [
  {
    platform: "whatsapp",
    contactName: "Chioma Okafor",
    contactHandle: "+234 803 456 7890",
    status: "open",
    priority: "high",
    messages: [
      { direction: "inbound", content: "Hello! I saw the 999 book announcement on your page. How do I pre-order?", minutesAgo: 45 },
      { direction: "outbound", content: "Hi Chioma! Thanks for reaching out. Pre-orders are open at the link in our bio. Would you like me to send you the direct link?", minutesAgo: 42 },
      { direction: "inbound", content: "Yes please! Also, will there be a Lagos signing event?", minutesAgo: 38 },
    ],
  },
  {
    platform: "instagram",
    contactName: "TundeVibes",
    contactHandle: "@tundevibes_ng",
    status: "pending",
    priority: "normal",
    messages: [
      { direction: "inbound", content: "Oga Charly Boy! Your last post was 🔥🔥🔥 Can I get a feature on your page? I'm a young artist from Abuja.", minutesAgo: 120 },
      { direction: "outbound", content: "Thanks TundeVibes! Send us your portfolio via DM and we'll review it for the creator program.", minutesAgo: 100 },
      { direction: "inbound", content: "I just sent it! Also I commented on the 999 post, hope you saw it 🙏", minutesAgo: 95 },
    ],
  },
  {
    platform: "x",
    contactName: "Ngozi Adeyemi",
    contactHandle: "@ngozi_creates",
    status: "open",
    priority: "urgent",
    messages: [
      { direction: "inbound", content: "@charlyboy I've been waiting 3 weeks for my merch order. No tracking number, no response from support. Very disappointed 😤", minutesAgo: 15 },
      { direction: "inbound", content: "Order #AF-20241201. I have the receipt. Please respond ASAP.", minutesAgo: 12 },
    ],
  },
  {
    platform: "tiktok",
    contactName: "Emeka_TT",
    contactHandle: "@emeka_tt_naija",
    status: "open",
    priority: "normal",
    messages: [
      { direction: "inbound", content: "Your 999 video went viral on my FYP! I shared it and got 50k views. Can we collab on a duet?", minutesAgo: 200 },
      { direction: "outbound", content: "That's incredible! We love seeing the community respond. Reach out to our collab team at creators@areafada.com", minutesAgo: 180 },
      { direction: "inbound", content: "Done! Also can you follow me? My fans would go crazy 😂", minutesAgo: 170 },
    ],
  },
  {
    platform: "email",
    contactName: "Adaeze Nwachukwu",
    contactHandle: "adaeze.nwachukwu@gmail.com",
    status: "resolved",
    priority: "normal",
    messages: [
      { direction: "inbound", content: "Good morning. I am a brand manager at Flutterwave and we would like to discuss a partnership opportunity with Charly Boy for Q1 2025. Please let us know if you're open to a brief call.", minutesAgo: 1440 },
      { direction: "outbound", content: "Good morning Adaeze! We're absolutely open to this conversation. Please share your availability and we'll schedule a call. Our team will reach out within 24 hours.", minutesAgo: 1380 },
      { direction: "inbound", content: "Wonderful! I'm available Monday to Wednesday, 10am - 3pm WAT. Looking forward to connecting.", minutesAgo: 1320 },
      { direction: "outbound", content: "Perfect. We've scheduled a call for Monday at 11am WAT. You'll receive a calendar invite shortly. Thank you for reaching out!", minutesAgo: 1200 },
    ],
  },
  {
    platform: "linkedin",
    contactName: "Babatunde Olatunji",
    contactHandle: "linkedin.com/in/babatundeolatunji",
    status: "open",
    priority: "normal",
    messages: [
      { direction: "inbound", content: "Hello, I'm a media consultant who has worked with top Nigerian entertainers. I believe I can add significant value to the 999 global campaign. Would love to connect.", minutesAgo: 360 },
    ],
  },
  {
    platform: "instagram",
    contactName: "BeautyByFatima",
    contactHandle: "@beautybyfatima_abj",
    status: "open",
    priority: "low",
    messages: [
      { direction: "inbound", content: "Hi! I'm a beauty creator with 45k followers. I would love to do a sponsored review of any Charly Boy merchandise. What are your rates?", minutesAgo: 480 },
    ],
  },
  {
    platform: "whatsapp",
    contactName: "Pastor Emmanuel",
    contactHandle: "+234 701 234 5678",
    status: "closed",
    priority: "low",
    messages: [
      { direction: "inbound", content: "Good evening. My church would like to invite Area Fada to speak at our Youth Conference in March. We can accommodate travel and honorarium.", minutesAgo: 2880 },
      { direction: "outbound", content: "Thank you for the invitation, Pastor Emmanuel. Please send the official event details to bookings@areafada.com and our team will get back to you within 5 business days.", minutesAgo: 2820 },
    ],
  },
];

async function seedIfEmpty(userId: number): Promise<void> {
  const existing = await db
    .select({ id: supportConversationsTable.id })
    .from(supportConversationsTable)
    .where(eq(supportConversationsTable.userId, userId))
    .limit(1);

  if (existing.length > 0) return;

  for (const demo of DEMO_CONVERSATIONS) {
    const now = new Date();
    const lastMsg = demo.messages[demo.messages.length - 1];
    const lastMsgAt = new Date(now.getTime() - lastMsg.minutesAgo * 60 * 1000);

    const [conv] = await db
      .insert(supportConversationsTable)
      .values({
        userId,
        platform: demo.platform,
        contactName: demo.contactName,
        contactHandle: demo.contactHandle,
        status: demo.status,
        priority: demo.priority,
        unreadCount: demo.messages.filter(m => m.direction === "inbound").length,
        lastMessageAt: lastMsgAt,
      })
      .returning({ id: supportConversationsTable.id });

    for (const msg of demo.messages) {
      await db.insert(supportMessagesTable).values({
        conversationId: conv.id,
        direction: msg.direction,
        content: msg.content,
        senderName: msg.direction === "inbound" ? demo.contactName : "You",
        sentAt: new Date(now.getTime() - msg.minutesAgo * 60 * 1000),
      });
    }
  }
}

// ─── GET /api/support/stats ───────────────────────────────────────────────────
router.get("/support/stats", requireAuth, async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  await seedIfEmpty(user.id);

  const rows = await db
    .select({ status: supportConversationsTable.status })
    .from(supportConversationsTable)
    .where(eq(supportConversationsTable.userId, user.id));

  const open = rows.filter(r => r.status === "open").length;
  const pending = rows.filter(r => r.status === "pending").length;
  const resolved = rows.filter(r => r.status === "resolved").length;
  const closed = rows.filter(r => r.status === "closed").length;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayNew = await db
    .select({ id: supportConversationsTable.id })
    .from(supportConversationsTable)
    .where(
      and(
        eq(supportConversationsTable.userId, user.id),
        sql`${supportConversationsTable.createdAt} >= ${today}`,
      )
    );

  res.json({ open, pending, resolved, closed, total: rows.length, todayNew: todayNew.length });
});

// ─── GET /api/support/conversations ──────────────────────────────────────────
router.get("/support/conversations", requireAuth, async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  await seedIfEmpty(user.id);

  const { platform, status, search } = req.query as Record<string, string>;

  const conditions = [eq(supportConversationsTable.userId, user.id)];
  if (platform && platform !== "all") conditions.push(eq(supportConversationsTable.platform, platform));
  if (status && status !== "all") conditions.push(eq(supportConversationsTable.status, status));
  if (search) {
    conditions.push(
      or(
        ilike(supportConversationsTable.contactName, `%${search}%`),
        ilike(supportConversationsTable.contactHandle, `%${search}%`),
      )!
    );
  }

  const conversations = await db
    .select()
    .from(supportConversationsTable)
    .where(and(...conditions))
    .orderBy(desc(supportConversationsTable.lastMessageAt));

  res.json({ conversations });
});

// ─── GET /api/support/conversations/:id/messages ─────────────────────────────
router.get("/support/conversations/:id/messages", requireAuth, async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const convId = parseInt(req.params.id, 10);
  const conv = await db
    .select()
    .from(supportConversationsTable)
    .where(and(eq(supportConversationsTable.id, convId), eq(supportConversationsTable.userId, user.id)))
    .limit(1);

  if (!conv.length) { res.status(404).json({ error: "Conversation not found" }); return; }

  const messages = await db
    .select()
    .from(supportMessagesTable)
    .where(eq(supportMessagesTable.conversationId, convId))
    .orderBy(supportMessagesTable.sentAt);

  await db
    .update(supportConversationsTable)
    .set({ unreadCount: 0 })
    .where(eq(supportConversationsTable.id, convId));

  res.json({ conversation: conv[0], messages });
});

// ─── POST /api/support/conversations/:id/reply ───────────────────────────────
router.post("/support/conversations/:id/reply", requireAuth, async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const convId = parseInt(req.params.id, 10);
  const conv = await db
    .select()
    .from(supportConversationsTable)
    .where(and(eq(supportConversationsTable.id, convId), eq(supportConversationsTable.userId, user.id)))
    .limit(1);

  if (!conv.length) { res.status(404).json({ error: "Conversation not found" }); return; }

  const { content } = req.body as { content?: string };
  if (!content?.trim()) { res.status(400).json({ error: "content is required" }); return; }

  const [message] = await db
    .insert(supportMessagesTable)
    .values({
      conversationId: convId,
      direction: "outbound",
      content: content.trim(),
      senderName: user.displayName ?? "You",
      sentAt: new Date(),
    })
    .returning();

  await db
    .update(supportConversationsTable)
    .set({ lastMessageAt: new Date(), status: conv[0].status === "pending" ? "open" : conv[0].status, updatedAt: new Date() })
    .where(eq(supportConversationsTable.id, convId));

  res.json({ message });
});

// ─── PATCH /api/support/conversations/:id ────────────────────────────────────
router.patch("/support/conversations/:id", requireAuth, async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const convId = parseInt(req.params.id, 10);
  const { status, priority, labels, assignedTo } = req.body as {
    status?: string;
    priority?: string;
    labels?: string[];
    assignedTo?: string;
  };

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (status) patch.status = status;
  if (priority) patch.priority = priority;
  if (labels !== undefined) patch.labels = JSON.stringify(labels);
  if (assignedTo !== undefined) patch.assignedTo = assignedTo;

  const [updated] = await db
    .update(supportConversationsTable)
    .set(patch as any)
    .where(and(eq(supportConversationsTable.id, convId), eq(supportConversationsTable.userId, user.id)))
    .returning();

  if (!updated) { res.status(404).json({ error: "Conversation not found" }); return; }
  res.json({ conversation: updated });
});

// ─── POST /api/support/conversations ─────────────────────────────────────────
router.post("/support/conversations", requireAuth, async (req, res): Promise<void> => {
  const user = await getUser(req);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const { platform, contactName, contactHandle, contactEmail, firstMessage } =
    req.body as { platform: string; contactName: string; contactHandle?: string; contactEmail?: string; firstMessage?: string };

  if (!platform || !PLATFORMS.includes(platform as any)) {
    res.status(400).json({ error: "Valid platform required", platforms: PLATFORMS });
    return;
  }
  if (!contactName?.trim()) { res.status(400).json({ error: "contactName is required" }); return; }

  const [conv] = await db
    .insert(supportConversationsTable)
    .values({ userId: user.id, platform, contactName: contactName.trim(), contactHandle, contactEmail, status: "open", priority: "normal", unreadCount: 0 })
    .returning();

  if (firstMessage?.trim()) {
    await db.insert(supportMessagesTable).values({
      conversationId: conv.id,
      direction: "inbound",
      content: firstMessage.trim(),
      senderName: contactName.trim(),
    });
    await db
      .update(supportConversationsTable)
      .set({ unreadCount: 1, lastMessageAt: new Date() })
      .where(eq(supportConversationsTable.id, conv.id));
  }

  res.status(201).json({ conversation: conv });
});

// ─── Helper ───────────────────────────────────────────────────────────────────
async function getUser(req: any) {
  const rows = await db
    .select({ id: usersTable.id, displayName: usersTable.displayName })
    .from(usersTable)
    .where(eq(usersTable.clerkId, req.clerkUserId))
    .limit(1);
  return rows[0] ?? null;
}

export default router;
