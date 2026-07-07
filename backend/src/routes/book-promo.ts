import { Router } from "express";
import QRCode from "qrcode";
import { db } from "@workspace/db";
import {
  promoCampaignsTable,
  promoLinksTable,
  linkClicksTable,
  purchaseVerificationsTable,
  affiliateCommissionsTable,
  usersTable,
} from "@workspace/db";
import { eq, desc, and, count, sql } from "drizzle-orm";
import { requireAuth } from "./users";
import { requireTier } from "../middlewares/tierGuard";

const router = Router();

async function getDbUser(clerkId: string) {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  return user ?? null;
}

function nanoid6() {
  return Math.random().toString(36).slice(2, 8);
}

function slugify(str: string) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// ─── Seed demo data ────────────────────────────────────────────────────────────
async function seedPromoData(userId: number) {
  const slug = "999";
  const [existing] = await db.select().from(promoCampaignsTable).where(and(eq(promoCampaignsTable.userId, userId), eq(promoCampaignsTable.slug, slug)));
  if (existing) return;

  const launchDate = new Date();
  launchDate.setDate(launchDate.getDate() + 30);

  const [campaign] = await db.insert(promoCampaignsTable).values({
    userId, name: "999 Book Launch", slug,
    bookTitle: "999 — The Charly Boy Manifesto",
    synopsis: "999 is more than a book. It is a battle cry for the misfit, the rebel, the Area Fada in all of us. After 40 years of fighting the system, Charly Boy distils his hardest lessons into 999 provocative truths about life, creativity, and survival in Nigeria.",
    chapterPreview: "Chapter 1: The Rebel's Code\n\nThey told me I was too loud, too strange, too much. I said — not enough. The first rule of the 999 code: never shrink to fit a space that was not built for you...",
    destinationUrl: "https://charlyboy.com/999",
    paystackLink: "https://paystack.com/pay/999-book",
    launchDate,
    primaryColor: "#16a34a",
    description: "Official 999 book launch campaign — track every click, every sale, every share.",
  }).returning();

  const channels = [
    { channel: "ig", label: "Instagram" },
    { channel: "wa", label: "WhatsApp" },
    { channel: "twitter", label: "Twitter / X" },
    { channel: "tiktok", label: "TikTok" },
    { channel: "poster", label: "Physical Poster" },
    { channel: "tv", label: "TV / Radio" },
  ];

  const linkRows = await db.insert(promoLinksTable).values(
    channels.map(c => ({ campaignId: campaign.id, userId, channel: c.channel, label: c.label, clickCount: Math.floor(Math.random() * 800), conversionCount: Math.floor(Math.random() * 60) }))
  ).returning();

  await db.insert(purchaseVerificationsTable).values([
    { campaignId: campaign.id, userId, fanName: "Nkechi Adeyemi", fanEmail: "nkechi@gmail.com", fanPhone: "+2348012345678", paymentRef: "PSK-" + nanoid6().toUpperCase(), receiptNote: "Paid ₦4,500 via Paystack", status: "pending" },
    { campaignId: campaign.id, userId, fanName: "Emeka Okafor", fanEmail: "emeka.ok@yahoo.com", paymentRef: "PSK-" + nanoid6().toUpperCase(), receiptNote: "Purchased on Selar", status: "approved", bonusCode: "BONUS-" + nanoid6().toUpperCase(), reviewedAt: new Date() },
    { campaignId: campaign.id, userId, fanName: "Aisha Bello", fanEmail: "aisha.bello@outlook.com", fanPhone: "+2347098765432", paymentRef: "FLW-" + nanoid6().toUpperCase(), receiptNote: "Flutterwave receipt attached", status: "approved", bonusCode: "BONUS-" + nanoid6().toUpperCase(), reviewedAt: new Date() },
  ]);

  if (linkRows.length > 0) {
    await db.insert(affiliateCommissionsTable).values([
      { promoLinkId: linkRows[0].id, campaignId: campaign.id, userId, ambassadorName: "Alex Martins", ambassadorEmail: "alex@areafada.com", commissionRate: "15", totalClicks: 342, totalConversions: 27, totalEarned: "12150", paidAmount: "8100", payoutStatus: "processing" },
      { promoLinkId: linkRows[1].id, campaignId: campaign.id, userId, ambassadorName: "Chidi Nwosu", ambassadorEmail: "chidi@fanbase.ng", commissionRate: "10", totalClicks: 189, totalConversions: 14, totalEarned: "6300", paidAmount: "0", payoutStatus: "pending" },
    ]);
  }
}

// ─── GET /promo-campaigns ──────────────────────────────────────────────────────
router.get("/promo-campaigns", requireAuth, requireTier("creator"), async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    let campaigns = await db.select().from(promoCampaignsTable)
      .where(eq(promoCampaignsTable.userId, user.id))
      .orderBy(desc(promoCampaignsTable.createdAt));

    if (campaigns.length === 0 && process.env.NODE_ENV !== "production") {
      await seedPromoData(user.id);
      campaigns = await db.select().from(promoCampaignsTable)
        .where(eq(promoCampaignsTable.userId, user.id))
        .orderBy(desc(promoCampaignsTable.createdAt));
    }

    res.json(campaigns);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to list campaigns" });
  }
});

// ─── POST /promo-campaigns ─────────────────────────────────────────────────────
router.post("/promo-campaigns", requireAuth, requireTier("creator"), async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    const { name, destinationUrl, bookTitle, synopsis, chapterPreview, paystackLink, launchDate, primaryColor, description, coverImageUrl } = req.body;
    if (!name || !destinationUrl) { res.status(400).json({ error: "name and destinationUrl required" }); return; }

    const baseSlug = slugify(name);
    const slug = baseSlug + "-" + nanoid6();

    const [created] = await db.insert(promoCampaignsTable).values({
      userId: user.id, name, slug, destinationUrl, bookTitle: bookTitle ?? name,
      synopsis, chapterPreview, paystackLink, primaryColor: primaryColor ?? "#16a34a",
      description, coverImageUrl,
      launchDate: launchDate ? new Date(launchDate) : undefined,
    }).returning();
    res.status(201).json(created);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create campaign" });
  }
});

// ─── PATCH /promo-campaigns/:id ────────────────────────────────────────────────
router.patch("/promo-campaigns/:id", requireAuth, requireTier("creator"), async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    const { name, destinationUrl, bookTitle, synopsis, chapterPreview, paystackLink, launchDate, primaryColor, description, coverImageUrl, active } = req.body;
    const [updated] = await db.update(promoCampaignsTable)
      .set({ name, destinationUrl, bookTitle, synopsis, chapterPreview, paystackLink, primaryColor, description, coverImageUrl, active, updatedAt: new Date(), launchDate: launchDate ? new Date(launchDate) : undefined })
      .where(and(eq(promoCampaignsTable.id, Number(req.params.id)), eq(promoCampaignsTable.userId, user.id)))
      .returning();
    if (!updated) { res.status(404).json({ error: "Campaign not found" }); return; }
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update campaign" });
  }
});

// ─── DELETE /promo-campaigns/:id ───────────────────────────────────────────────
router.delete("/promo-campaigns/:id", requireAuth, requireTier("creator"), async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    await db.delete(promoCampaignsTable)
      .where(and(eq(promoCampaignsTable.id, Number(req.params.id)), eq(promoCampaignsTable.userId, user.id)));
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete campaign" });
  }
});

// ─── GET /promo-campaigns/:id/links ────────────────────────────────────────────
router.get("/promo-campaigns/:id/links", requireAuth, requireTier("creator"), async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    const links = await db.select().from(promoLinksTable)
      .where(and(eq(promoLinksTable.campaignId, Number(req.params.id)), eq(promoLinksTable.userId, user.id)))
      .orderBy(desc(promoLinksTable.clickCount));
    res.json(links);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to list links" });
  }
});

// ─── POST /promo-campaigns/:id/links ───────────────────────────────────────────
router.post("/promo-campaigns/:id/links", requireAuth, requireTier("creator"), async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    const campaignId = Number(req.params.id);
    const [campaign] = await db.select().from(promoCampaignsTable)
      .where(and(eq(promoCampaignsTable.id, campaignId), eq(promoCampaignsTable.userId, user.id)));
    if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }

    const { channel, label } = req.body;
    if (!channel || !label) { res.status(400).json({ error: "channel and label required" }); return; }

    const [created] = await db.insert(promoLinksTable).values({ campaignId, userId: user.id, channel, label }).returning();
    res.status(201).json(created);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create link" });
  }
});

// ─── DELETE /promo-links/:id ────────────────────────────────────────────────────
router.delete("/promo-links/:id", requireAuth, requireTier("creator"), async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    await db.delete(promoLinksTable)
      .where(and(eq(promoLinksTable.id, Number(req.params.id)), eq(promoLinksTable.userId, user.id)));
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete link" });
  }
});

// ─── GET /promo-campaigns/:id/qr/:channel ──────────────────────────────────────
router.get("/promo-campaigns/:id/qr/:channel", requireAuth, requireTier("creator"), async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    const campaignId = Number(req.params.id);
    const { channel } = req.params;

    const [campaign] = await db.select().from(promoCampaignsTable)
      .where(and(eq(promoCampaignsTable.id, campaignId), eq(promoCampaignsTable.userId, user.id)));
    if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }

    const [link] = await db.select().from(promoLinksTable)
      .where(and(eq(promoLinksTable.campaignId, campaignId), eq(promoLinksTable.channel, channel), eq(promoLinksTable.userId, user.id)));
    if (!link) { res.status(404).json({ error: "Link not found" }); return; }

    const host = req.headers["x-forwarded-host"] ?? req.headers.host ?? "areafadaos.replit.app";
    const proto = req.headers["x-forwarded-proto"] ?? "https";
    const trackUrl = `${proto}://${host}/api/p/${campaign.slug}/${channel}`;

    const format = (req.query.format ?? "png") as string;
    if (format === "svg") {
      const svg = await QRCode.toString(trackUrl, { type: "svg", color: { dark: campaign.primaryColor, light: "#ffffff" }, width: 300, margin: 2 });
      res.setHeader("Content-Type", "image/svg+xml");
      res.setHeader("Content-Disposition", `attachment; filename="qr-${campaign.slug}-${channel}.svg"`);
      res.send(svg);
    } else {
      const buf = await QRCode.toBuffer(trackUrl, { type: "png", color: { dark: campaign.primaryColor, light: "#ffffff" }, width: 400, margin: 2 });
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Content-Disposition", `attachment; filename="qr-${campaign.slug}-${channel}.png"`);
      res.send(buf);
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to generate QR code" });
  }
});

// ─── GET /p/:slug/:channel — public redirect + click tracking ─────────────────
router.get("/p/:slug/:channel", async (req: any, res): Promise<void> => {
  try {
    const { slug, channel } = req.params;
    const [campaign] = await db.select().from(promoCampaignsTable).where(eq(promoCampaignsTable.slug, slug));
    if (!campaign) { res.status(404).send("Not found"); return; }

    const [link] = await db.select().from(promoLinksTable)
      .where(and(eq(promoLinksTable.campaignId, campaign.id), eq(promoLinksTable.channel, channel)));

    if (link) {
      await db.insert(linkClicksTable).values({
        promoLinkId: link.id, campaignId: campaign.id,
        ip: String(req.headers["x-forwarded-for"] ?? req.socket.remoteAddress ?? ""),
        userAgent: req.headers["user-agent"] ?? "",
        referer: req.headers.referer ?? "",
      });
      await db.update(promoLinksTable).set({ clickCount: link.clickCount + 1 }).where(eq(promoLinksTable.id, link.id));
    }

    res.redirect(302, campaign.destinationUrl);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error");
  }
});

// ─── GET /promo-campaigns/:id/funnel ───────────────────────────────────────────
router.get("/promo-campaigns/:id/funnel", requireAuth, requireTier("creator"), async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    const campaignId = Number(req.params.id);
    const [campaign] = await db.select().from(promoCampaignsTable)
      .where(and(eq(promoCampaignsTable.id, campaignId), eq(promoCampaignsTable.userId, user.id)));
    if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }

    const links = await db.select().from(promoLinksTable)
      .where(and(eq(promoLinksTable.campaignId, campaignId), eq(promoLinksTable.userId, user.id)))
      .orderBy(desc(promoLinksTable.clickCount));

    const totalClicks = links.reduce((s, l) => s + l.clickCount, 0);
    const totalConversions = links.reduce((s, l) => s + l.conversionCount, 0);

    const [verificationStats] = await db.select({
      pending: sql<number>`COUNT(*) FILTER (WHERE status = 'pending')`,
      approved: sql<number>`COUNT(*) FILTER (WHERE status = 'approved')`,
    }).from(purchaseVerificationsTable)
      .where(and(eq(purchaseVerificationsTable.campaignId, campaignId), eq(purchaseVerificationsTable.userId, user.id)));

    const funnelSteps = [
      { step: "Clicks", value: totalClicks },
      { step: "Page Visits", value: Math.round(totalClicks * 0.72) },
      { step: "Downloads / CTA", value: Math.round(totalClicks * 0.38) },
      { step: "Purchases", value: Number(verificationStats?.approved ?? 0) + totalConversions },
    ];

    const channelBreakdown = links.map(l => ({
      channel: l.channel, label: l.label,
      clicks: l.clickCount, conversions: l.conversionCount,
      conversionRate: l.clickCount > 0 ? ((l.conversionCount / l.clickCount) * 100).toFixed(1) : "0.0",
    }));

    res.json({ campaign, funnelSteps, channelBreakdown, totalClicks, totalConversions, pendingVerifications: Number(verificationStats?.pending ?? 0) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to get funnel data" });
  }
});

// ─── POST /promo-campaigns/:id/drip-schedule ───────────────────────────────────
router.post("/promo-campaigns/:id/drip-schedule", requireAuth, requireTier("creator"), async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    const campaignId = Number(req.params.id);
    const [campaign] = await db.select().from(promoCampaignsTable)
      .where(and(eq(promoCampaignsTable.id, campaignId), eq(promoCampaignsTable.userId, user.id)));
    if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }

    const launchDate = campaign.launchDate ? new Date(campaign.launchDate) : new Date(Date.now() + 30 * 24 * 3600 * 1000);

    const templates = [
      { daysBeforeLaunch: 30, platform: "instagram", content: `📢 Something BIG is coming in 30 days. The ${campaign.bookTitle} drops on ${launchDate.toDateString()}. Are you ready? #999 #CharlyBoy #AreaFada` },
      { daysBeforeLaunch: 28, platform: "twitter", content: `I've been writing this for 40 years. ${campaign.bookTitle} — 999 truths I wish someone had told me. Mark your calendar. 🗓 ${launchDate.toDateString()}` },
      { daysBeforeLaunch: 25, platform: "instagram", content: `CHAPTER PREVIEW: "They told me I was too loud, too strange, too much. I said — not enough." — From ${campaign.bookTitle}. Pre-order link in bio.` },
      { daysBeforeLaunch: 21, platform: "tiktok", content: `3 weeks to launch. Here's why I wrote ${campaign.bookTitle} — a message to every misfit, rebel and dreamer in Nigeria 🇳🇬 #999 #CharlyBoy` },
      { daysBeforeLaunch: 18, platform: "instagram", content: `Fan testimony: "This book changed how I see failure. It's not the end — it's the data." Pre-order ${campaign.bookTitle} now. Link in bio.` },
      { daysBeforeLaunch: 14, platform: "twitter", content: `2 weeks out. ${campaign.bookTitle} is not a book about success. It's a book about surviving the system and coming out yourself. ${campaign.paystackLink ?? campaign.destinationUrl}` },
      { daysBeforeLaunch: 10, platform: "instagram", content: `10 days to launch! 🔥 I'm giving away 5 signed copies of ${campaign.bookTitle} to fans who share this post. Drop a 🙌 below to enter. #999 #AreaFada` },
      { daysBeforeLaunch: 7, platform: "tiktok", content: `7 days. ONE WEEK. ${campaign.bookTitle} will challenge everything you thought you knew about being different. Get your copy: ${campaign.paystackLink ?? campaign.destinationUrl}` },
      { daysBeforeLaunch: 5, platform: "instagram", content: `FINAL CHAPTER PREVIEW: The last chapter of ${campaign.bookTitle} is called "The 999 Code". I'm sharing the first page free right now. Swipe 👉` },
      { daysBeforeLaunch: 3, platform: "twitter", content: `3 days. If you know someone who needs to read ${campaign.bookTitle} — tag them here. This book is for the ones who refused to give up. #999` },
      { daysBeforeLaunch: 1, platform: "instagram", content: `TOMORROW IS THE DAY! 🚀 ${campaign.bookTitle} launches in 24 hours. Set your alarm. Tell your friends. This changes everything. ${campaign.paystackLink ?? campaign.destinationUrl}` },
      { daysBeforeLaunch: 0, platform: "instagram", content: `🎉 IT'S LAUNCH DAY! ${campaign.bookTitle} is LIVE! Get your copy NOW and join the 999 movement. ${campaign.paystackLink ?? campaign.destinationUrl} #999 #CharlyBoy #AreaFada #LaunchDay` },
      { daysBeforeLaunch: -3, platform: "twitter", content: `We're LIVE! ${campaign.bookTitle} is already changing lives. Here's what fans are saying — thread below 🧵` },
      { daysBeforeLaunch: -7, platform: "instagram", content: `First week numbers are IN. ${campaign.bookTitle} hits different. Thank you to every fan who grabbed their copy. Still available: ${campaign.paystackLink ?? campaign.destinationUrl}` },
    ];

    const scheduledPosts = templates.map(t => {
      const postDate = new Date(launchDate);
      postDate.setDate(postDate.getDate() - t.daysBeforeLaunch);
      return { platform: t.platform, content: t.content, scheduledDate: postDate.toISOString() };
    });

    res.json({ message: `Drip schedule generated — ${scheduledPosts.length} posts ready`, posts: scheduledPosts, campaignId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to generate drip schedule" });
  }
});

// ─── GET /purchase-verifications ───────────────────────────────────────────────
router.get("/purchase-verifications", requireAuth, requireTier("creator"), async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    const { campaignId, status } = req.query as Record<string, string>;
    let rows = await db.select().from(purchaseVerificationsTable)
      .where(eq(purchaseVerificationsTable.userId, user.id))
      .orderBy(desc(purchaseVerificationsTable.createdAt));

    if (campaignId) rows = rows.filter(r => r.campaignId === Number(campaignId));
    if (status) rows = rows.filter(r => r.status === status);

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to list verifications" });
  }
});

// ─── POST /purchase-verifications (public — fan submits) ───────────────────────
router.post("/purchase-verifications", async (req: any, res): Promise<void> => {
  try {
    const { campaignId, fanName, fanEmail, fanPhone, paymentRef, receiptNote } = req.body;
    if (!campaignId || !fanName || !fanEmail) { res.status(400).json({ error: "campaignId, fanName and fanEmail required" }); return; }

    const [campaign] = await db.select().from(promoCampaignsTable).where(eq(promoCampaignsTable.id, Number(campaignId)));
    if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }

    const [created] = await db.insert(purchaseVerificationsTable).values({
      campaignId: Number(campaignId), userId: campaign.userId, fanName, fanEmail, fanPhone, paymentRef, receiptNote,
    }).returning();
    res.status(201).json({ message: "Submission received — you'll get your bonus code within 24 hours", id: created.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to submit verification" });
  }
});

// ─── PATCH /purchase-verifications/:id (admin review) ─────────────────────────
router.patch("/purchase-verifications/:id", requireAuth, requireTier("creator"), async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    const { status, reviewNote } = req.body;
    if (!["approved", "rejected"].includes(status)) { res.status(400).json({ error: "status must be approved or rejected" }); return; }

    const bonusCode = status === "approved" ? "BONUS-" + nanoid6().toUpperCase() : undefined;
    const [updated] = await db.update(purchaseVerificationsTable)
      .set({ status, reviewNote, bonusCode, reviewedAt: new Date() })
      .where(and(eq(purchaseVerificationsTable.id, Number(req.params.id)), eq(purchaseVerificationsTable.userId, user.id)))
      .returning();

    if (!updated) { res.status(404).json({ error: "Verification not found" }); return; }
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to review verification" });
  }
});

// ─── GET /affiliate-commissions ────────────────────────────────────────────────
router.get("/affiliate-commissions", requireAuth, requireTier("creator"), async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    const { campaignId } = req.query as Record<string, string>;
    let rows = await db.select().from(affiliateCommissionsTable)
      .where(eq(affiliateCommissionsTable.userId, user.id))
      .orderBy(desc(affiliateCommissionsTable.totalEarned));

    if (campaignId) rows = rows.filter(r => r.campaignId === Number(campaignId));
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to list commissions" });
  }
});

// ─── POST /affiliate-commissions ───────────────────────────────────────────────
router.post("/affiliate-commissions", requireAuth, requireTier("creator"), async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    const { campaignId, ambassadorName, ambassadorEmail, commissionRate } = req.body;
    if (!campaignId || !ambassadorName || !ambassadorEmail) { res.status(400).json({ error: "campaignId, ambassadorName and ambassadorEmail required" }); return; }

    const [campaign] = await db.select().from(promoCampaignsTable)
      .where(and(eq(promoCampaignsTable.id, Number(campaignId)), eq(promoCampaignsTable.userId, user.id)));
    if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }

    const channel = "aff-" + slugify(ambassadorName) + "-" + nanoid6();
    const [link] = await db.insert(promoLinksTable).values({ campaignId: Number(campaignId), userId: user.id, channel, label: `Affiliate: ${ambassadorName}` }).returning();

    const [created] = await db.insert(affiliateCommissionsTable).values({
      promoLinkId: link.id, campaignId: Number(campaignId), userId: user.id,
      ambassadorName, ambassadorEmail, commissionRate: commissionRate ?? "10",
    }).returning();

    const host = req.headers["x-forwarded-host"] ?? req.headers.host ?? "areafadaos.replit.app";
    const proto = req.headers["x-forwarded-proto"] ?? "https";
    const referralUrl = `${proto}://${host}/api/p/${campaign.slug}/${channel}`;

    res.status(201).json({ ...created, referralUrl, promoLink: link });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create affiliate" });
  }
});

// ─── PATCH /affiliate-commissions/:id/payout ──────────────────────────────────
router.patch("/affiliate-commissions/:id/payout", requireAuth, requireTier("creator"), async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    const [commission] = await db.select().from(affiliateCommissionsTable)
      .where(and(eq(affiliateCommissionsTable.id, Number(req.params.id)), eq(affiliateCommissionsTable.userId, user.id)));
    if (!commission) { res.status(404).json({ error: "Commission record not found" }); return; }

    const due = Number(commission.totalEarned) - Number(commission.paidAmount);
    const [updated] = await db.update(affiliateCommissionsTable)
      .set({ paidAmount: commission.totalEarned, payoutStatus: "paid" })
      .where(eq(affiliateCommissionsTable.id, commission.id))
      .returning();

    res.json({ ...updated, amountPaid: due, message: `Payout of ₦${due.toLocaleString()} marked — initiate via Paystack dashboard` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to process payout" });
  }
});

export default router;
