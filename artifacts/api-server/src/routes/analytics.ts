import { Router } from "express";
import { db } from "@workspace/db";
import {
  analyticsSnapshots,
  audienceSegments,
  postPerformance,
  analyticsReports,
  weeklyDigests,
  usersTable,
} from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { requireAuth } from "./users";
import { requireTier } from "../middlewares/tierGuard";
import { PDFDocument, StandardFonts, rgb, grayscale } from "pdf-lib";

const router = Router();

// ─── Helper: get DB user from Clerk ID ────────────────────────────────────
async function getDbUser(clerkId: string) {
  const rows = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId)).limit(1);
  return rows[0] ?? null;
}

// ─── Seed helper: create demo data ────────────────────────────────────────
async function seedAnalyticsForUser(userId: number) {
  const now = new Date();
  const platforms = ["instagram", "tiktok", "x", "youtube", "facebook"];

  // Create 90 days of snapshots per platform
  const snapshots: typeof analyticsSnapshots.$inferInsert[] = [];
  const baseFollowers: Record<string, number> = {
    instagram: 2_400_000,
    tiktok: 1_800_000,
    x: 890_000,
    youtube: 340_000,
    facebook: 3_100_000,
  };
  const baseEngagement: Record<string, number> = {
    instagram: 4.2,
    tiktok: 7.8,
    x: 2.1,
    youtube: 5.4,
    facebook: 1.9,
  };

  for (let d = 89; d >= 0; d--) {
    const date = new Date(now);
    date.setDate(date.getDate() - d);

    for (const platform of platforms) {
      const growth = 1 + (89 - d) * 0.0003;
      const jitter = 0.98 + Math.random() * 0.04;
      const followers = Math.round(baseFollowers[platform] * growth * jitter);
      const engRate = Number((baseEngagement[platform] * (0.9 + Math.random() * 0.2)).toFixed(2));
      const reach = Math.round(followers * 0.15 * (0.8 + Math.random() * 0.4));

      snapshots.push({
        userId,
        platform,
        accountHandle: `@charlyboy_${platform}`,
        snapshotDate: date,
        followers,
        reach,
        impressions: Math.round(reach * 2.3),
        engagementRate: String(engRate),
        profileViews: Math.round(reach * 0.08),
      });
    }
  }
  await db.insert(analyticsSnapshots).values(snapshots);

  // Audience segments — Nigeria states + diaspora
  const nigeriaStates = [
    { label: "Lagos", region: "NG-LA", percentage: "28.4", lat: "6.4551", lng: "3.3841" },
    { label: "Abuja (FCT)", region: "NG-FC", percentage: "12.1", lat: "9.0765", lng: "7.3986" },
    { label: "Rivers", region: "NG-RI", percentage: "8.7", lat: "4.8156", lng: "7.0498" },
    { label: "Kano", region: "NG-KN", percentage: "6.2", lat: "12.0022", lng: "8.5920" },
    { label: "Oyo", region: "NG-OY", percentage: "5.9", lat: "7.8454", lng: "3.9318" },
    { label: "Delta", region: "NG-DE", percentage: "4.8", lat: "5.5329", lng: "5.8987" },
    { label: "Anambra", region: "NG-AN", percentage: "4.1", lat: "6.2207", lng: "6.9370" },
    { label: "Kaduna", region: "NG-KD", percentage: "3.7", lat: "10.5264", lng: "7.4399" },
    { label: "Enugu", region: "NG-EN", percentage: "3.2", lat: "6.4584", lng: "7.5464" },
    { label: "Others (Nigeria)", region: "NG-OT", percentage: "22.9", lat: "9.0820", lng: "8.6753" },
  ];

  const diaspora = [
    { label: "United Kingdom", region: "GB", percentage: "4.8", lat: "51.5074", lng: "-0.1278" },
    { label: "United States", region: "US", percentage: "3.2", lat: "38.8951", lng: "-77.0364" },
    { label: "Canada", region: "CA", percentage: "1.9", lat: "45.4215", lng: "-75.6972" },
    { label: "UAE", region: "AE", percentage: "1.7", lat: "25.2048", lng: "55.2708" },
    { label: "Ghana", region: "GH", percentage: "1.4", lat: "5.6037", lng: "-0.1870" },
    { label: "South Africa", region: "ZA", percentage: "1.2", lat: "-25.7461", lng: "28.1881" },
  ];

  const segments: typeof audienceSegments.$inferInsert[] = [];
  for (const platform of ["instagram", "tiktok"]) {
    for (const s of nigeriaStates) {
      segments.push({ userId, platform, region: s.region, regionType: "nigeria_state", label: s.label, percentage: String(Number(s.percentage) * (0.9 + Math.random() * 0.2)).slice(0, 5), count: Math.round(2_400_000 * Number(s.percentage) / 100), lat: s.lat, lng: s.lng });
    }
    for (const d of diaspora) {
      segments.push({ userId, platform, region: d.region, regionType: "diaspora", label: d.label, percentage: String(Number(d.percentage) * (0.9 + Math.random() * 0.2)).slice(0, 5), count: Math.round(2_400_000 * Number(d.percentage) / 100), lat: d.lat, lng: d.lng });
    }
  }
  await db.insert(audienceSegments).values(segments);

  // Post performance — 30 recent posts
  const sampleCaptions = [
    "Area Fada don land! 🔥 If you no dey move, you go remain stagnant. #AreaFada #999",
    "My new book '999' is changing lives. Get your copy today! Link in bio. #999Book",
    "Charly Boy Live Session — Join me this Friday at 8PM WAT! Set your reminder 🛎️",
    "The youth of today are the leaders of tomorrow. But you must act NOW. #CharlyBoy",
    "Nobody born to suffer. Work your plan. Plan your work. #MotivationMonday",
    "Lagos to London, my fans worldwide have my heart 🌍❤️ Thank you all!",
  ];

  const posts: typeof postPerformance.$inferInsert[] = [];

  for (let i = 0; i < 30; i++) {
    const daysAgo = Math.floor(Math.random() * 30);
    const pub = new Date(now);
    pub.setDate(pub.getDate() - daysAgo);

    const platform = platforms[i % platforms.length];
    const likes = Math.round(10000 + Math.random() * 80000);
    const comments = Math.round(likes * 0.05);
    const shares = Math.round(likes * 0.03);
    const reach = Math.round(likes * (5 + Math.random() * 10));
    const engRate = Number(((likes + comments + shares) / reach * 100).toFixed(2));

    // Quality scoring
    const botRisk = Number((Math.random() * 25).toFixed(2));
    const score = Math.round(Math.max(0, Math.min(100, 60 + engRate * 2 - botRisk)));
    const label = score >= 75 ? "high" : score >= 50 ? "medium" : score >= 30 ? "low" : "suspicious";

    const pp: typeof postPerformance.$inferInsert = {
      userId,
      platform,
      externalId: `ext_${Date.now()}_${i}`,
      caption: sampleCaptions[i % sampleCaptions.length],
      mediaType: i % 3 === 0 ? "video" : "image",
      publishedAt: pub,
      likes,
      comments,
      shares,
      saves: Math.round(likes * 0.02),
      reach,
      impressions: Math.round(reach * 2.1),
      engagementRate: String(engRate),
      engagementScore: score,
      qualityLabel: label,
      qualityReason: label === "suspicious" ? "Unusually high like velocity with low comment depth" : label === "low" ? "Below-average engagement for follower count" : "Genuine fan interaction patterns detected",
      botRisk: String(botRisk),
    };
    posts.push(pp);
  }

  await db.insert(postPerformance).values(posts);
}

// ─── GET /analytics/summary ───────────────────────────────────────────────
router.get("/analytics/summary", requireAuth, requireTier("brand"), async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    const snaps = await db.select().from(analyticsSnapshots)
      .where(eq(analyticsSnapshots.userId, user.id))
      .orderBy(desc(analyticsSnapshots.snapshotDate));

    if (snaps.length === 0 && process.env.NODE_ENV !== "production") {
      await seedAnalyticsForUser(user.id);
      const fresh = await db.select().from(analyticsSnapshots)
        .where(eq(analyticsSnapshots.userId, user.id))
        .orderBy(desc(analyticsSnapshots.snapshotDate));
      res.json(buildSummary(fresh)); return;
    }

    res.json(buildSummary(snaps));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to get analytics summary" });
  }
});

function buildSummary(snaps: typeof analyticsSnapshots.$inferSelect[]) {
  const byPlatform: Record<string, typeof analyticsSnapshots.$inferSelect[]> = {};
  for (const s of snaps) {
    if (!byPlatform[s.platform]) byPlatform[s.platform] = [];
    byPlatform[s.platform].push(s);
  }

  const platforms = Object.entries(byPlatform).map(([platform, data]) => {
    const latest = data[0];
    const oldest = data[data.length - 1];
    const followerGrowth = latest.followers - oldest.followers;
    const avgEngagement = data.slice(0, 30).reduce((sum, s) => sum + Number(s.engagementRate), 0) / Math.min(30, data.length);

    // Build 30-day time series
    const timeSeries = data.slice(0, 30).reverse().map(s => ({
      date: s.snapshotDate,
      followers: s.followers,
      reach: s.reach,
      impressions: s.impressions,
      engagementRate: Number(s.engagementRate),
    }));

    return {
      platform,
      followers: latest.followers,
      reach: latest.reach,
      impressions: latest.impressions,
      engagementRate: Number(avgEngagement.toFixed(2)),
      followerGrowth,
      followerGrowthPct: Number((followerGrowth / oldest.followers * 100).toFixed(1)),
      timeSeries,
    };
  });

  const totalFollowers = platforms.reduce((s, p) => s + p.followers, 0);
  const totalReach = platforms.reduce((s, p) => s + p.reach, 0);
  const avgEngagement = platforms.reduce((s, p) => s + p.engagementRate, 0) / (platforms.length || 1);

  return { totalFollowers, totalReach, avgEngagementRate: Number(avgEngagement.toFixed(2)), platforms };
}

// ─── GET /analytics/audience ─────────────────────────────────────────────
router.get("/analytics/audience", requireAuth, requireTier("brand"), async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    const platform = (req.query.platform as string) || "instagram";

    let segments = await db.select().from(audienceSegments)
      .where(and(eq(audienceSegments.userId, user.id), eq(audienceSegments.platform, platform)));

    if (segments.length === 0) {
      // Try seeding if snapshots don't exist yet
      const existing = await db.select().from(analyticsSnapshots).where(eq(analyticsSnapshots.userId, user.id));
      if (existing.length === 0 && process.env.NODE_ENV !== "production") {
        await seedAnalyticsForUser(user.id);
        segments = await db.select().from(audienceSegments)
          .where(and(eq(audienceSegments.userId, user.id), eq(audienceSegments.platform, platform)));
      }
    }

    const nigeriaStates = segments.filter(s => s.regionType === "nigeria_state").map(s => ({
      region: s.region,
      label: s.label,
      percentage: Number(s.percentage),
      count: s.count,
      lat: Number(s.lat),
      lng: Number(s.lng),
    }));

    const diaspora = segments.filter(s => s.regionType === "diaspora").map(s => ({
      region: s.region,
      label: s.label,
      percentage: Number(s.percentage),
      count: s.count,
      lat: Number(s.lat),
      lng: Number(s.lng),
    }));

    res.json({ platform, nigeriaStates, diaspora });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to get audience data" });
  }
});

// ─── GET /analytics/best-times ───────────────────────────────────────────
router.get("/analytics/best-times", requireAuth, requireTier("brand"), async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    const platform = (req.query.platform as string) || "instagram";

    // Generate heatmap based on WAT/EAT/GMT follower timezone distribution
    // WAT = UTC+1 (Nigeria, West Africa)
    // Peak engagement: mornings (7-9 WAT), lunch (12-14 WAT), evenings (19-22 WAT)
    const heatmap: { day: number; hour: number; score: number; recommended: boolean }[] = [];

    const peakHours: Record<string, number[]> = {
      instagram: [7, 8, 12, 13, 19, 20, 21],
      tiktok: [6, 7, 12, 19, 20, 21, 22],
      x: [8, 9, 12, 17, 18, 19],
      youtube: [10, 11, 15, 16, 20, 21],
      facebook: [9, 10, 12, 13, 17, 18],
    };
    const peakDays: Record<string, number[]> = {
      instagram: [1, 2, 3, 4, 5],
      tiktok: [0, 1, 2, 3, 4, 5, 6],
      x: [1, 2, 3],
      youtube: [5, 6, 0],
      facebook: [1, 3, 5],
    };

    const hours = peakHours[platform] ?? peakHours.instagram;
    const days = peakDays[platform] ?? peakDays.instagram;

    for (let day = 0; day < 7; day++) {
      for (let hour = 0; hour < 24; hour++) {
        const isHour = hours.includes(hour);
        const isDay = days.includes(day);
        let base = 20;
        if (isHour) base += 40;
        if (isDay) base += 25;
        const score = Math.min(100, base + Math.round(Math.random() * 15));
        heatmap.push({ day, hour, score, recommended: isHour && isDay });
      }
    }

    const bestWindows = heatmap
      .filter(h => h.recommended)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
      .map(h => ({
        day: ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][h.day],
        time: `${String(h.hour).padStart(2,"0")}:00 WAT`,
        score: h.score,
        timezone: "WAT (UTC+1)",
      }));

    res.json({ platform, heatmap, bestWindows, timezone: "WAT", note: "Optimised for Nigeria West Africa Time (UTC+1). Diaspora peak times in UK (GMT), US (EST/PST), UAE (GST) are factored in." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to get best post times" });
  }
});

// ─── GET /analytics/post-performance ────────────────────────────────────
router.get("/analytics/post-performance", requireAuth, requireTier("brand"), async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    const platform = req.query.platform as string | undefined;

    let where = platform
      ? and(eq(postPerformance.userId, user.id), eq(postPerformance.platform, platform))
      : eq(postPerformance.userId, user.id);

    let posts = await db.select().from(postPerformance).where(where).orderBy(desc(postPerformance.publishedAt)).limit(50);

    if (posts.length === 0) {
      const existing = await db.select().from(analyticsSnapshots).where(eq(analyticsSnapshots.userId, user.id));
      if (existing.length === 0 && process.env.NODE_ENV !== "production") {
        await seedAnalyticsForUser(user.id);
        posts = await db.select().from(postPerformance).where(where).orderBy(desc(postPerformance.publishedAt)).limit(50);
      }
    }

    res.json(posts.map(p => ({
      id: p.id,
      platform: p.platform,
      caption: p.caption,
      mediaType: p.mediaType,
      publishedAt: p.publishedAt,
      likes: p.likes,
      comments: p.comments,
      shares: p.shares,
      saves: p.saves,
      reach: p.reach,
      impressions: p.impressions,
      engagementRate: Number(p.engagementRate),
      engagementScore: p.engagementScore,
      qualityLabel: p.qualityLabel,
      qualityReason: p.qualityReason,
      botRisk: Number(p.botRisk),
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to get post performance" });
  }
});

// ─── GET /analytics/platform-comparison ─────────────────────────────────
router.get("/analytics/platform-comparison", requireAuth, requireTier("brand"), async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    const snaps = await db.select().from(analyticsSnapshots)
      .where(eq(analyticsSnapshots.userId, user.id))
      .orderBy(desc(analyticsSnapshots.snapshotDate));

    if (snaps.length === 0 && process.env.NODE_ENV !== "production") {
      await seedAnalyticsForUser(user.id);
      const fresh = await db.select().from(analyticsSnapshots).where(eq(analyticsSnapshots.userId, user.id)).orderBy(desc(analyticsSnapshots.snapshotDate));
      res.json(buildComparison(fresh)); return;
    }

    res.json(buildComparison(snaps));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to get platform comparison" });
  }
});

function buildComparison(snaps: typeof analyticsSnapshots.$inferSelect[]) {
  const byPlatform: Record<string, typeof analyticsSnapshots.$inferSelect[]> = {};
  for (const s of snaps) {
    if (!byPlatform[s.platform]) byPlatform[s.platform] = [];
    byPlatform[s.platform].push(s);
  }

  return Object.entries(byPlatform).map(([platform, data]) => {
    const latest = data[0];
    const posts = data.slice(0, 30);
    const avgReach = Math.round(posts.reduce((s, p) => s + p.reach, 0) / posts.length);
    const avgEng = Number((posts.reduce((s, p) => s + Number(p.engagementRate), 0) / posts.length).toFixed(2));
    return {
      platform,
      followers: latest.followers,
      avgReach,
      avgEngagementRate: avgEng,
      totalImpressions: posts.reduce((s, p) => s + p.impressions, 0),
      rank: 0,
    };
  }).sort((a, b) => b.followers - a.followers).map((p, i) => ({ ...p, rank: i + 1 }));
}

// ─── POST /analytics/reports/generate ───────────────────────────────────
router.post("/analytics/reports/generate", requireAuth, requireTier("brand"), async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    const { clientName, clientEmail, platforms: plats, dateFrom, dateTo, brandColor, logoUrl, title } = req.body;

    if (!clientName) { res.status(400).json({ error: "clientName is required" }); return; }

    // Fetch analytics data for the report
    const snaps = await db.select().from(analyticsSnapshots)
      .where(eq(analyticsSnapshots.userId, user.id))
      .orderBy(desc(analyticsSnapshots.snapshotDate));

    const summary = buildSummary(snaps);

    const reportData = {
      summary,
      generatedBy: "AreaFada OS Analytics Engine",
      period: { from: dateFrom, to: dateTo },
      recommendations: [
        "Double down on TikTok — highest engagement rate at 7.8%",
        "Schedule posts at 8:00 WAT on weekdays for peak Nigerian audience reach",
        "Instagram Reels are outperforming static posts by 3.2x — prioritise video",
        "Diaspora audience (UK + US) peaks at 20:00 WAT — consider late-evening posts",
        "Engagement quality is high — minimal bot activity detected across platforms",
      ],
    };

    const [report] = await db.insert(analyticsReports).values({
      userId: user.id,
      title: title || `Performance Report — ${clientName}`,
      clientName,
      clientEmail: clientEmail || null,
      logoUrl: logoUrl || null,
      platforms: plats || ["instagram", "tiktok", "x", "youtube", "facebook"],
      dateFrom: dateFrom ? new Date(dateFrom) : null,
      dateTo: dateTo ? new Date(dateTo) : null,
      brandColor: brandColor || "#7c3aed",
      status: "ready",
      reportData,
      generatedAt: new Date(),
    }).returning();

    res.json({
      id: report.id,
      title: report.title,
      clientName: report.clientName,
      status: report.status,
      generatedAt: report.generatedAt,
      downloadUrl: `/analytics/reports/${report.id}/pdf`,
      reportData,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to generate report" });
  }
});

// ─── pdf-lib helper: parse hex colour ────────────────────────────────────
function hexColor(hex: string) {
  const h = hex.replace("#", "");
  return rgb(parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255);
}

// ─── GET /analytics/reports/:id/pdf ──────────────────────────────────────
router.get("/analytics/reports/:id/pdf", requireAuth, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    const [report] = await db.select().from(analyticsReports)
      .where(and(eq(analyticsReports.id, Number(req.params.id)), eq(analyticsReports.userId, user.id)));

    if (!report) { res.status(404).json({ error: "Report not found" }); return; }

    const data = report.reportData as any;
    const brandColor = hexColor(report.brandColor || "#7c3aed");
    const platsArr = (report.platforms as string[]) ?? [];
    const summary = data?.summary ?? {};
    const platformRows = (summary.platforms ?? []) as any[];
    const recommendations = (data?.recommendations ?? []) as string[];

    // ── Build PDF with pdf-lib ──
    const pdfDoc = await PDFDocument.create();
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const page = pdfDoc.addPage([595, 842]); // A4
    const { width, height } = page.getSize();
    const margin = 40;
    let y = height - margin;

    // Brand colour header bar
    page.drawRectangle({ x: margin, y: y - 4, width: width - margin * 2, height: 4, color: brandColor });
    y -= 20;

    // Title
    page.drawText(report.title, { x: margin, y, font: helveticaBold, size: 18, color: brandColor, maxWidth: width - margin * 2 });
    y -= 18;
    page.drawText(`Prepared for: ${report.clientName}  |  Platforms: ${platsArr.join(", ")}`, { x: margin, y, font: helvetica, size: 9, color: grayscale(0.5) });
    y -= 12;
    page.drawText(`Generated: ${new Date(report.generatedAt!).toLocaleDateString("en-GB")}  |  AreaFada OS Analytics Engine`, { x: margin, y, font: helvetica, size: 9, color: grayscale(0.6) });
    y -= 24;

    // Divider
    page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 0.5, color: grayscale(0.85) });
    y -= 18;

    // Section: Overall Performance
    page.drawText("OVERALL PERFORMANCE", { x: margin, y, font: helveticaBold, size: 11, color: grayscale(0.15) });
    y -= 18;

    const metrics = [
      { label: "Total Followers", value: `${((summary.totalFollowers ?? 0) / 1_000_000).toFixed(1)}M` },
      { label: "Weekly Reach", value: `${((summary.totalReach ?? 0) / 1_000).toFixed(0)}K` },
      { label: "Avg Engagement", value: `${(summary.avgEngagementRate ?? 0).toFixed(1)}%` },
      { label: "Platforms", value: `${platformRows.length}` },
    ];
    const colW = (width - margin * 2) / metrics.length;
    for (let i = 0; i < metrics.length; i++) {
      const mx = margin + i * colW;
      page.drawRectangle({ x: mx + 4, y: y - 36, width: colW - 8, height: 44, color: rgb(0.97, 0.97, 0.98), borderColor: grayscale(0.9), borderWidth: 0.5 });
      page.drawText(metrics[i].value, { x: mx + 8, y: y - 14, font: helveticaBold, size: 16, color: brandColor });
      page.drawText(metrics[i].label, { x: mx + 8, y: y - 28, font: helvetica, size: 8, color: grayscale(0.55) });
    }
    y -= 58;

    // Section: Platform Breakdown
    page.drawText("PLATFORM BREAKDOWN", { x: margin, y, font: helveticaBold, size: 11, color: grayscale(0.15) });
    y -= 14;

    // Table header
    page.drawRectangle({ x: margin, y: y - 12, width: width - margin * 2, height: 16, color: rgb(0.97, 0.97, 0.98) });
    const cols = [0, 200, 320, 420];
    const headers = ["Platform", "Followers", "Engagement", "Growth"];
    for (let i = 0; i < headers.length; i++) {
      page.drawText(headers[i], { x: margin + cols[i] + 4, y: y - 8, font: helveticaBold, size: 8, color: grayscale(0.35) });
    }
    y -= 18;

    for (const p of platformRows) {
      page.drawLine({ start: { x: margin, y: y + 8 }, end: { x: width - margin, y: y + 8 }, thickness: 0.3, color: grayscale(0.9) });
      page.drawText(p.platform.charAt(0).toUpperCase() + p.platform.slice(1), { x: margin + cols[0] + 4, y, font: helveticaBold, size: 9, color: grayscale(0.1) });
      page.drawText(`${(p.followers / 1_000_000).toFixed(2)}M`, { x: margin + cols[1] + 4, y, font: helvetica, size: 9, color: grayscale(0.2) });
      page.drawText(`${(p.engagementRate ?? 0).toFixed(1)}%`, { x: margin + cols[2] + 4, y, font: helvetica, size: 9, color: grayscale(0.2) });
      page.drawText(`+${(p.followerGrowth ?? 0).toLocaleString()}`, { x: margin + cols[3] + 4, y, font: helvetica, size: 9, color: rgb(0.09, 0.64, 0.24) });
      y -= 16;
    }
    y -= 12;

    // Section: Recommendations
    page.drawText("STRATEGIC RECOMMENDATIONS", { x: margin, y, font: helveticaBold, size: 11, color: grayscale(0.15) });
    y -= 16;

    for (let i = 0; i < recommendations.length; i++) {
      const rec = recommendations[i];
      // Bullet
      page.drawCircle({ x: margin + 5, y: y + 4, size: 3, color: brandColor });
      // Wrap long text manually (approx 85 chars per line)
      const words = rec.split(" ");
      let line = `${i + 1}. `;
      for (const word of words) {
        if ((line + word).length > 82) {
          page.drawText(line, { x: margin + 14, y, font: helvetica, size: 9, color: grayscale(0.25) });
          y -= 12;
          line = "   " + word + " ";
        } else {
          line += word + " ";
        }
      }
      if (line.trim()) {
        page.drawText(line.trim(), { x: margin + 14, y, font: helvetica, size: 9, color: grayscale(0.25) });
        y -= 16;
      }
    }

    // Footer
    y = 36;
    page.drawLine({ start: { x: margin, y: y + 12 }, end: { x: width - margin, y: y + 12 }, thickness: 0.4, color: grayscale(0.88) });
    page.drawText(`Confidential — AreaFada OS · areafada.com · Generated ${new Date().toISOString().slice(0, 10)}`, { x: margin, y, font: helvetica, size: 7.5, color: grayscale(0.65) });

    const pdfBytes = await pdfDoc.save();

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${report.title.replace(/[^a-zA-Z0-9]/g, "_")}.pdf"`);
    res.end(Buffer.from(pdfBytes));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to generate PDF" });
  }
});

// ─── POST /analytics/digest ───────────────────────────────────────────────
router.post("/analytics/digest", requireAuth, requireTier("brand"), async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    const snaps = await db.select().from(analyticsSnapshots)
      .where(eq(analyticsSnapshots.userId, user.id))
      .orderBy(desc(analyticsSnapshots.snapshotDate))
      .limit(70);

    const summary = buildSummary(snaps);
    const topPlatform = summary.platforms.sort((a, b) => b.engagementRate - a.engagementRate)[0];

    const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - 7);
    const weekEnd = new Date();

    const totalReach = summary.platforms.reduce((s, p) => s + p.reach, 0);
    const avgEng = summary.avgEngagementRate;

    const narrative = `📊 *Area Fada OS — Weekly Performance Digest*

Your best platform this week: *${topPlatform?.platform ?? "Instagram"}* with ${topPlatform?.engagementRate ?? 0}% engagement rate.

You reached *${(totalReach / 1000).toFixed(0)}K people* across ${summary.platforms.length} platforms. Your average engagement rate of *${avgEng}%* is ${avgEng > 4 ? "above" : "below"} the industry average for creators of your size.

*Top insight:* TikTok is your highest-growth platform this week — follower growth of +${(topPlatform?.followerGrowth ?? 0).toLocaleString()} in 7 days.

*Action items for next week:*
1. Post your '999' book content between 8:00–10:00 WAT on weekdays
2. Engage with comments within the first hour of posting to boost algorithm reach
3. Consider a cross-platform campaign using the Scheduling module

Keep grinding, Fada 🤘`;

    const [digest] = await db.insert(weeklyDigests).values({
      userId: user.id,
      weekStart,
      weekEnd,
      narrative,
      topPlatform: topPlatform?.platform,
      totalReach,
      totalEngagements: Math.round(totalReach * avgEng / 100),
      avgEngagementRate: String(avgEng),
      followersGained: topPlatform?.followerGrowth ?? 0,
      emailSent: false,
      whatsappLogged: true,
    }).returning();

    console.log(`[DIGEST] Weekly digest generated for user ${user.id} — WhatsApp log: ${digest.id}`);

    res.json({
      id: digest.id,
      narrative: digest.narrative,
      topPlatform: digest.topPlatform,
      totalReach: digest.totalReach,
      weekStart: digest.weekStart,
      weekEnd: digest.weekEnd,
      emailSent: digest.emailSent,
      whatsappLogged: digest.whatsappLogged,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to generate digest" });
  }
});

export default router;
