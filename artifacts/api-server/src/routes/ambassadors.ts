import { Router } from "express";
import { randomUUID } from "crypto";
import { Resend } from "resend";
import { db } from "@workspace/db";
import {
  ambassadorsTable,
  ambassadorPointsTable,
  gamificationConfigsTable,
  rewardTiersTable,
  ambassadorTasksTable,
  taskCompletionsTable,
  microInfluencersTable,
  whatsappBroadcastsTable,
  usersTable,
} from "@workspace/db";
import { eq, desc, and, gte, ilike, sql, inArray } from "drizzle-orm";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function csvSafe(val: string): string {
  const escaped = val.replace(/"/g, '""');
  return /^[=+\-@|]/.test(val) ? `'${escaped}` : escaped;
}
import { requireAuth } from "./users";
import { requireTier } from "../middlewares/tierGuard";

const router = Router();

async function getDbUser(clerkId: string) {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId)).limit(1);
  return user ?? null;
}

// ── Nigeria geopolitical data ─────────────────────────────────────────────

const NIGERIA_STATES = [
  { state: "Lagos", zone: "South West" },
  { state: "Ogun", zone: "South West" },
  { state: "Oyo", zone: "South West" },
  { state: "Osun", zone: "South West" },
  { state: "Ondo", zone: "South West" },
  { state: "Ekiti", zone: "South West" },
  { state: "Delta", zone: "South South" },
  { state: "Edo", zone: "South South" },
  { state: "Rivers", zone: "South South" },
  { state: "Bayelsa", zone: "South South" },
  { state: "Cross River", zone: "South South" },
  { state: "Akwa Ibom", zone: "South South" },
  { state: "Anambra", zone: "South East" },
  { state: "Imo", zone: "South East" },
  { state: "Abia", zone: "South East" },
  { state: "Enugu", zone: "South East" },
  { state: "Ebonyi", zone: "South East" },
  { state: "Kano", zone: "North West" },
  { state: "Katsina", zone: "North West" },
  { state: "Kaduna", zone: "North West" },
  { state: "Jigawa", zone: "North West" },
  { state: "Kebbi", zone: "North West" },
  { state: "Sokoto", zone: "North West" },
  { state: "Zamfara", zone: "North West" },
  { state: "Borno", zone: "North East" },
  { state: "Adamawa", zone: "North East" },
  { state: "Gombe", zone: "North East" },
  { state: "Taraba", zone: "North East" },
  { state: "Yobe", zone: "North East" },
  { state: "Bauchi", zone: "North East" },
  { state: "Benue", zone: "North Central" },
  { state: "Kogi", zone: "North Central" },
  { state: "Kwara", zone: "North Central" },
  { state: "Nasarawa", zone: "North Central" },
  { state: "Niger", zone: "North Central" },
  { state: "Plateau", zone: "North Central" },
  { state: "FCT (Abuja)", zone: "North Central" },
];

const SEED_NAMES = [
  "Chukwuemeka Obi", "Fatimah Suleiman", "Oluwaseun Adeyemi", "Blessing Okafor",
  "Musa Abubakar", "Ngozi Eze", "Kehinde Olawale", "Aisha Bello",
  "Chidi Nwachukwu", "Halima Yusuf", "Tokunbo Femi", "Amina Garba",
  "Emeka Anyanwu", "Kemi Adebayo", "Ibrahim Danladi", "Chioma Nwosu",
  "Bayo Olatunji", "Nkechi Onyeka", "Sadiq Haruna", "Funke Adesanya",
  "Obiageli Chukwu", "Garba Maiduguri", "Adunola Praise", "Tayo Alabi",
  "Hauwa Shettima", "Emeka Ogidi", "Yetunde Babs", "Mallam Usman",
  "Chinwe Okoye", "Deji Adeleke", "Zainab Sani", "Victor Effiong",
  "Abimbola Coker", "Nnamdi Ibe", "Rabi Maigari", "Salami Afolabi",
  "Ugochi Mbah",
];

const NICHES = ["music", "fashion", "lifestyle", "politics", "comedy", "sports", "beauty", "food", "tech", "culture"];
const PLATFORMS = ["instagram", "tiktok", "x", "youtube"];

function initials(name: string) {
  return name.split(" ").slice(0, 2).map(n => n[0]).join("").toUpperCase();
}

async function seedAmbassadorData(userId: number) {
  const now = new Date();

  // Seed ambassadors (one per state)
  const ambassadors: typeof ambassadorsTable.$inferInsert[] = NIGERIA_STATES.map((s, i) => {
    const name = SEED_NAMES[i] ?? `Ambassador ${s.state}`;
    const pts = Math.round(200 + Math.random() * 4800);
    const tier = pts >= 4000 ? "gold" : pts >= 2000 ? "silver" : pts >= 800 ? "bronze" : "member";
    return {
      userId,
      name,
      email: `${name.split(" ")[0].toLowerCase()}@area-fada-ambassadors.ng`,
      phone: `+2348${String(Math.floor(Math.random() * 9e7 + 1e7))}`,
      state: s.state,
      zone: s.zone,
      city: s.state === "Lagos" ? "Lagos Island" : s.state === "FCT (Abuja)" ? "Abuja" : s.state,
      tier,
      status: Math.random() > 0.1 ? "active" : "inactive",
      avatarInitials: initials(name),
      platform: PLATFORMS[i % PLATFORMS.length],
      handle: `@${name.split(" ")[0].toLowerCase()}_${s.state.toLowerCase().replace(/\s/g, "")}`,
      followerCount: Math.round(1000 + Math.random() * 49000),
      totalPoints: pts,
      tasksCompleted: Math.round(Math.random() * 12),
      referrals: Math.round(Math.random() * 30),
      joinedAt: new Date(now.getTime() - Math.random() * 365 * 24 * 3600_000),
    };
  });
  await db.insert(ambassadorsTable).values(ambassadors);

  // Seed gamification configs
  const gamConfigs: typeof gamificationConfigsTable.$inferInsert[] = [
    { userId, actionKey: "share_post", label: "Share a Post", description: "Ambassador shares branded post on any platform", pointValue: 10, active: true },
    { userId, actionKey: "verified_referral", label: "Verified Purchase Referral", description: "New customer signs up using ambassador link", pointValue: 50, active: true },
    { userId, actionKey: "task_complete", label: "Complete Assigned Task", description: "Ambassador marks a campaign task as complete", pointValue: 25, active: true },
    { userId, actionKey: "community_post", label: "Community Post", description: "Original content posted in ambassador group", pointValue: 15, active: true },
    { userId, actionKey: "event_attendance", label: "Event Attendance", description: "Ambassador attends a Charly Boy event or activation", pointValue: 100, active: true },
    { userId, actionKey: "recruit_member", label: "Recruit New Ambassador", description: "Brings in a new verified ambassador to the network", pointValue: 75, active: true },
  ];
  await db.insert(gamificationConfigsTable).values(gamConfigs);

  // Seed reward tiers
  const rewardTiers: typeof rewardTiersTable.$inferInsert[] = [
    { userId, name: "Member", minPoints: 0, maxPoints: 799, badgeColor: "#6b7280", rewardDescription: "Welcome to the network. Start earning points!" },
    { userId, name: "Bronze", minPoints: 800, maxPoints: 1999, badgeColor: "#92400e", rewardDescription: "Access to exclusive broadcast groups + branded merch" },
    { userId, name: "Silver", minPoints: 2000, maxPoints: 3999, badgeColor: "#6b7280", rewardDescription: "Priority task assignment + ₦20,000 airtime monthly" },
    { userId, name: "Gold", minPoints: 4000, maxPoints: null, badgeColor: "#f59e0b", rewardDescription: "VIP event access + ₦50,000 monthly reward + co-branded content" },
  ];
  await db.insert(rewardTiersTable).values(rewardTiers);

  // Seed ambassador tasks
  const tasks: typeof ambassadorTasksTable.$inferInsert[] = [
    { userId, title: "Share the 999 Book Launch Post", description: "Share the official 999 book launch post on Instagram and tag 3 friends. Screenshot completion.", deadline: new Date(now.getTime() + 7 * 24 * 3600_000), targetGroup: "all", targetStates: NIGERIA_STATES.map(s => s.state), pointReward: 25, status: "active", totalAssigned: 37, completedCount: 18 },
    { userId, title: "South-West Activation Week", description: "Host or attend a Charly Boy brand activation event in your state this week.", deadline: new Date(now.getTime() + 14 * 24 * 3600_000), targetGroup: "zone:South West", targetStates: ["Lagos", "Ogun", "Oyo", "Osun", "Ondo", "Ekiti"], pointReward: 100, status: "active", totalAssigned: 6, completedCount: 2 },
    { userId, title: "Community Recruitment Drive", description: "Recruit at least 2 new verified ambassadors from your state before month end.", deadline: new Date(now.getTime() + 21 * 24 * 3600_000), targetGroup: "all", targetStates: NIGERIA_STATES.map(s => s.state), pointReward: 150, status: "active", totalAssigned: 37, completedCount: 7 },
    { userId, title: "Naija TikTok Challenge", description: "Create and post a TikTok using the #AreaFada999 sound. Must reach 500 views for points.", deadline: new Date(now.getTime() + 5 * 24 * 3600_000), targetGroup: "zone:South South", targetStates: ["Delta", "Edo", "Rivers", "Bayelsa", "Cross River", "Akwa Ibom"], pointReward: 50, status: "active", totalAssigned: 6, completedCount: 3 },
  ];
  await db.insert(ambassadorTasksTable).values(tasks);

  // Seed micro-influencers
  const influencers: typeof microInfluencersTable.$inferInsert[] = [
    { userId, name: "Sola Fashionista", handle: "@sola.fashion", platform: "instagram", state: "Lagos", zone: "South West", niche: "fashion", followerCount: 28500, engagementRate: "6.2", contactEmail: "sola@fashionista.ng", status: "available" },
    { userId, name: "Kelechi Comedy", handle: "@kccomedy", platform: "tiktok", state: "Anambra", zone: "South East", niche: "comedy", followerCount: 45000, engagementRate: "8.9", contactEmail: "kc@comedy.ng", status: "available" },
    { userId, name: "Naija Tech Bro", handle: "@techbro_ng", platform: "x", state: "Abuja", zone: "North Central", niche: "tech", followerCount: 12300, engagementRate: "4.1", contactEmail: "tb@techbro.ng", status: "engaged" },
    { userId, name: "Amaka Beauty", handle: "@amaka_glow", platform: "instagram", state: "Enugu", zone: "South East", niche: "beauty", followerCount: 18700, engagementRate: "7.3", contactEmail: "amaka@glow.ng", status: "available" },
    { userId, name: "Abdullahi Sports", handle: "@abdulsports", platform: "x", state: "Kano", zone: "North West", niche: "sports", followerCount: 9800, engagementRate: "5.4", status: "available" },
    { userId, name: "Ife Lifestyle", handle: "@ife_daily", platform: "instagram", state: "Oyo", zone: "South West", niche: "lifestyle", followerCount: 22100, engagementRate: "5.8", contactEmail: "ife@daily.ng", status: "partnered" },
    { userId, name: "Musa Culture", handle: "@musa_culture", platform: "tiktok", state: "Kaduna", zone: "North West", niche: "culture", followerCount: 31400, engagementRate: "9.2", status: "available" },
    { userId, name: "Chioma Food Blog", handle: "@chioma_eats", platform: "instagram", state: "Imo", zone: "South East", niche: "food", followerCount: 15600, engagementRate: "6.7", contactEmail: "chioma@eats.ng", status: "available" },
    { userId, name: "Tunde Music", handle: "@tundebeats", platform: "youtube", state: "Lagos", zone: "South West", niche: "music", followerCount: 8900, engagementRate: "4.8", status: "available" },
    { userId, name: "Bello Politics", handle: "@bello_ng", platform: "x", state: "Kogi", zone: "North Central", niche: "politics", followerCount: 14200, engagementRate: "3.9", status: "available" },
    { userId, name: "Funmi Body Goals", handle: "@funmi_fit", platform: "instagram", state: "Ogun", zone: "South West", niche: "lifestyle", followerCount: 19800, engagementRate: "6.1", contactEmail: "funmi@fit.ng", status: "available" },
    { userId, name: "Emeka Vibes", handle: "@emekavibes", platform: "tiktok", state: "Rivers", zone: "South South", niche: "music", followerCount: 37200, engagementRate: "10.1", status: "available" },
    { userId, name: "Zainab Modest Fashion", handle: "@zainab_modest", platform: "instagram", state: "Sokoto", zone: "North West", niche: "fashion", followerCount: 11300, engagementRate: "5.6", contactEmail: "zainab@modest.ng", status: "available" },
    { userId, name: "Victor Comedy Plug", handle: "@victorplug", platform: "tiktok", state: "Akwa Ibom", zone: "South South", niche: "comedy", followerCount: 25700, engagementRate: "8.3", status: "engaged" },
    { userId, name: "Ada Tech Reviews", handle: "@ada_reviews", platform: "youtube", state: "Anambra", zone: "South East", niche: "tech", followerCount: 7400, engagementRate: "5.2", contactEmail: "ada@reviews.ng", status: "available" },
  ];
  await db.insert(microInfluencersTable).values(influencers);

  // Seed WhatsApp broadcasts
  const broadcasts: typeof whatsappBroadcastsTable.$inferInsert[] = [];
  for (let i = 8; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i * 7);
    const sent = Math.round(1200 + Math.random() * 800);
    const delivered = Math.round(sent * (0.85 + Math.random() * 0.12));
    const clicks = Math.round(delivered * (0.08 + Math.random() * 0.15));
    const responses = Math.round(clicks * (0.2 + Math.random() * 0.3));
    broadcasts.push({
      userId,
      listName: ["All Ambassadors", "South West Network", "South East Network", "North Network", "Gold Tier", "Lagos Group"][i % 6],
      message: ["🔥 New post live! Share now and earn 10 points.", "📚 999 Book is out! Share the link with your community.", "🎤 Live session this Friday 8PM WAT. Tell your people!", "⚡ Weekly task assigned — check your dashboard.", "🏆 Leaderboard updated! Top 3 get surprise rewards.", "💰 New affiliate link live — 15% commission per sale!"][i % 6],
      sentCount: sent,
      deliveryCount: delivered,
      linkClicks: clicks,
      responseCount: responses,
      broadcastDate: date,
    });
  }
  await db.insert(whatsappBroadcastsTable).values(broadcasts);
}

// ─── GET /ambassadors ─────────────────────────────────────────────────────
router.get("/ambassadors", requireAuth, requireTier("agency"), async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    let rows = await db.select().from(ambassadorsTable)
      .where(eq(ambassadorsTable.userId, user.id))
      .orderBy(desc(ambassadorsTable.totalPoints));

    if (rows.length === 0 && process.env.NODE_ENV !== "production") {
      await seedAmbassadorData(user.id);
      rows = await db.select().from(ambassadorsTable)
        .where(eq(ambassadorsTable.userId, user.id))
        .orderBy(desc(ambassadorsTable.totalPoints));
    }

    const { state, zone, tier, status } = req.query as Record<string, string>;
    if (state) rows = rows.filter(r => r.state === state);
    if (zone) rows = rows.filter(r => r.zone === zone);
    if (tier) rows = rows.filter(r => r.tier === tier);
    if (status) rows = rows.filter(r => r.status === status);

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to list ambassadors" });
  }
});

// ─── POST /ambassadors ────────────────────────────────────────────────────
router.post("/ambassadors", requireAuth, requireTier("agency"), async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    const { name, email, phone, state, zone, city, platform, handle, followerCount, bio } = req.body;
    if (!name || !email || !state || !zone) { res.status(400).json({ error: "name, email, state, zone required" }); return; }

    const [created] = await db.insert(ambassadorsTable).values({
      userId: user.id, name, email, phone, state, zone, city, platform, handle,
      followerCount: followerCount ?? 0, bio, avatarInitials: initials(name),
    }).returning();

    res.status(201).json(created);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create ambassador" });
  }
});

// ─── PATCH /ambassadors/:id ───────────────────────────────────────────────
router.patch("/ambassadors/:id", requireAuth, requireTier("agency"), async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    const { name, email, phone, state, zone, city, platform, handle, followerCount, bio, status, tier } = req.body;
    const [updated] = await db.update(ambassadorsTable)
      .set({ name, email, phone, state, zone, city, platform, handle, followerCount, bio, status, tier })
      .where(and(eq(ambassadorsTable.id, Number(req.params.id)), eq(ambassadorsTable.userId, user.id)))
      .returning();

    if (!updated) { res.status(404).json({ error: "Ambassador not found" }); return; }
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update ambassador" });
  }
});

// ─── DELETE /ambassadors/:id ──────────────────────────────────────────────
router.delete("/ambassadors/:id", requireAuth, requireTier("agency"), async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    await db.delete(ambassadorsTable)
      .where(and(eq(ambassadorsTable.id, Number(req.params.id)), eq(ambassadorsTable.userId, user.id)));
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete ambassador" });
  }
});

// ─── GET /ambassadors/leaderboard ────────────────────────────────────────
router.get("/ambassadors/leaderboard", requireAuth, requireTier("agency"), async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    const rows = await db.select().from(ambassadorsTable)
      .where(eq(ambassadorsTable.userId, user.id))
      .orderBy(desc(ambassadorsTable.totalPoints))
      .limit(50);

    const leaderboard = rows.map((a, i) => ({ ...a, rank: i + 1 }));
    res.json(leaderboard);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to get leaderboard" });
  }
});

// ─── GET /ambassadors/leaderboard/csv ────────────────────────────────────
router.get("/ambassadors/leaderboard/csv", requireAuth, requireTier("agency"), async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    const rows = await db.select().from(ambassadorsTable)
      .where(eq(ambassadorsTable.userId, user.id))
      .orderBy(desc(ambassadorsTable.totalPoints));

    const header = "Rank,Name,State,Zone,Tier,Points,Tasks Completed,Referrals,Platform,Handle,Status";
    const csvRows = rows.map((a, i) =>
      `${i + 1},"${csvSafe(a.name)}","${csvSafe(a.state)}","${csvSafe(a.zone)}","${a.tier}",${a.totalPoints},${a.tasksCompleted},${a.referrals},"${csvSafe(a.platform ?? "")}","${csvSafe(a.handle ?? "")}","${a.status}"`
    );
    const csv = [header, ...csvRows].join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="area-fada-leaderboard-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to export CSV" });
  }
});

// ─── POST /ambassadors/:id/points ────────────────────────────────────────
router.post("/ambassadors/:id/points", requireAuth, requireTier("agency"), async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    const { action, points, description } = req.body;
    if (!action || !points) { res.status(400).json({ error: "action and points required" }); return; }

    const ambassadorId = Number(req.params.id);
    const [ambassador] = await db.select().from(ambassadorsTable)
      .where(and(eq(ambassadorsTable.id, ambassadorId), eq(ambassadorsTable.userId, user.id)));
    if (!ambassador) { res.status(404).json({ error: "Ambassador not found" }); return; }

    await db.insert(ambassadorPointsTable).values({ ambassadorId, userId: user.id, action, points, description });

    const newTotal = ambassador.totalPoints + points;
    const managedTiers = await db.select({ name: rewardTiersTable.name, minPoints: rewardTiersTable.minPoints })
      .from(rewardTiersTable).where(eq(rewardTiersTable.userId, user.id))
      .orderBy(desc(rewardTiersTable.minPoints));
    const tier = managedTiers.find(t => newTotal >= t.minPoints)?.name ?? "member";
    const [updated] = await db.update(ambassadorsTable)
      .set({ totalPoints: newTotal, tier })
      .where(eq(ambassadorsTable.id, ambassadorId))
      .returning();

    res.json({ ambassador: updated, pointsAwarded: points });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to award points" });
  }
});

// ─── GET /ambassador-tasks ────────────────────────────────────────────────
router.get("/ambassador-tasks", requireAuth, requireTier("agency"), async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    const tasks = await db.select().from(ambassadorTasksTable)
      .where(eq(ambassadorTasksTable.userId, user.id))
      .orderBy(desc(ambassadorTasksTable.createdAt));
    res.json(tasks);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to list tasks" });
  }
});

// ─── POST /ambassador-tasks ───────────────────────────────────────────────
router.post("/ambassador-tasks", requireAuth, requireTier("agency"), async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    const { title, description, deadline, targetGroup, targetStates, pointReward } = req.body;
    if (!title) { res.status(400).json({ error: "title required" }); return; }

    // Count ambassadors in target group
    let ambassadors = await db.select({ id: ambassadorsTable.id, state: ambassadorsTable.state, zone: ambassadorsTable.zone, tier: ambassadorsTable.tier })
      .from(ambassadorsTable).where(eq(ambassadorsTable.userId, user.id));

    const tg: string = targetGroup ?? "all";
    if (tg !== "all") {
      if (tg.startsWith("zone:")) {
        const zone = tg.replace("zone:", "");
        ambassadors = ambassadors.filter(a => a.zone === zone);
      } else if (tg.startsWith("tier:")) {
        const tier = tg.replace("tier:", "");
        ambassadors = ambassadors.filter(a => a.tier === tier);
      }
    }
    if (targetStates && (targetStates as string[]).length > 0) {
      ambassadors = ambassadors.filter(a => (targetStates as string[]).includes(a.state));
    }

    const [task] = await db.insert(ambassadorTasksTable).values({
      userId: user.id, title, description,
      deadline: deadline ? new Date(deadline) : undefined,
      targetGroup: targetGroup ?? "all",
      targetStates: targetStates ?? [],
      pointReward: pointReward ?? 0,
      totalAssigned: ambassadors.length,
    }).returning();

    res.status(201).json(task);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create task" });
  }
});

// ─── PATCH /ambassador-tasks/:id ─────────────────────────────────────────
router.patch("/ambassador-tasks/:id", requireAuth, requireTier("agency"), async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    const { title, description, deadline, status, pointReward } = req.body;
    const [updated] = await db.update(ambassadorTasksTable)
      .set({ title, description, deadline: deadline ? new Date(deadline) : undefined, status, pointReward })
      .where(and(eq(ambassadorTasksTable.id, Number(req.params.id)), eq(ambassadorTasksTable.userId, user.id)))
      .returning();

    if (!updated) { res.status(404).json({ error: "Task not found" }); return; }
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update task" });
  }
});

// ─── POST /ambassador-tasks/:id/complete ─────────────────────────────────
router.post("/ambassador-tasks/:id/complete", requireAuth, requireTier("agency"), async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    const taskId = Number(req.params.id);
    const { ambassadorId, notes } = req.body;
    if (!ambassadorId) { res.status(400).json({ error: "ambassadorId required" }); return; }

    // 1. Validate task ownership
    const [task] = await db.select().from(ambassadorTasksTable)
      .where(and(eq(ambassadorTasksTable.id, taskId), eq(ambassadorTasksTable.userId, user.id)));
    if (!task) { res.status(404).json({ error: "Task not found" }); return; }

    // 2. Validate ambassador ownership BEFORE any writes
    const [amb] = await db.select().from(ambassadorsTable)
      .where(and(eq(ambassadorsTable.id, ambassadorId), eq(ambassadorsTable.userId, user.id)));
    if (!amb) { res.status(403).json({ error: "Ambassador not found or access denied" }); return; }

    // 3. Check not already completed
    const [existing] = await db.select().from(taskCompletionsTable)
      .where(and(eq(taskCompletionsTable.taskId, taskId), eq(taskCompletionsTable.ambassadorId, ambassadorId)));
    if (existing) { res.status(409).json({ error: "Already completed by this ambassador" }); return; }

    // 4. All writes in an atomic transaction
    await db.transaction(async (tx) => {
      await tx.insert(taskCompletionsTable).values({ taskId, ambassadorId, userId: user.id, notes });
      await tx.update(ambassadorTasksTable)
        .set({ completedCount: task.completedCount + 1 })
        .where(eq(ambassadorTasksTable.id, taskId));

      const newTasksCompleted = amb.tasksCompleted + 1;
      if (task.pointReward > 0) {
        const newTotal = amb.totalPoints + task.pointReward;
        const mTiers = await tx.select({ name: rewardTiersTable.name, minPoints: rewardTiersTable.minPoints })
          .from(rewardTiersTable).where(eq(rewardTiersTable.userId, user.id))
          .orderBy(desc(rewardTiersTable.minPoints));
        const tier = (mTiers as Array<{ name: string; minPoints: number }>).find(t => newTotal >= t.minPoints)?.name ?? "member";
        await tx.insert(ambassadorPointsTable).values({
          ambassadorId, userId: user.id, action: "task_complete",
          points: task.pointReward, description: `Completed: ${task.title}`,
        });
        await tx.update(ambassadorsTable)
          .set({ totalPoints: newTotal, tier, tasksCompleted: newTasksCompleted })
          .where(eq(ambassadorsTable.id, ambassadorId));
      } else {
        await tx.update(ambassadorsTable)
          .set({ tasksCompleted: newTasksCompleted })
          .where(eq(ambassadorsTable.id, ambassadorId));
      }
    });

    res.json({ success: true, pointsAwarded: task.pointReward });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to mark task complete" });
  }
});

// ─── GET /gamification-configs ────────────────────────────────────────────
router.get("/gamification-configs", requireAuth, requireTier("agency"), async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    let configs = await db.select().from(gamificationConfigsTable)
      .where(eq(gamificationConfigsTable.userId, user.id));

    if (configs.length === 0 && process.env.NODE_ENV !== "production") {
      const [firstAmb] = await db.select().from(ambassadorsTable).where(eq(ambassadorsTable.userId, user.id)).limit(1);
      if (!firstAmb) await seedAmbassadorData(user.id);
      configs = await db.select().from(gamificationConfigsTable).where(eq(gamificationConfigsTable.userId, user.id));
    }

    const rewardTiers = await db.select().from(rewardTiersTable).where(eq(rewardTiersTable.userId, user.id));
    res.json({ configs, rewardTiers });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to get gamification config" });
  }
});

// ─── POST /gamification-configs ───────────────────────────────────────────
router.post("/gamification-configs", requireAuth, requireTier("agency"), async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    const { actionKey, label, description, pointValue, active } = req.body;
    if (!actionKey || !label) { res.status(400).json({ error: "actionKey and label required" }); return; }

    const [created] = await db.insert(gamificationConfigsTable)
      .values({ userId: user.id, actionKey, label, description, pointValue: pointValue ?? 10, active: active ?? true })
      .returning();
    res.status(201).json(created);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create config" });
  }
});

// ─── PATCH /gamification-configs/:id ─────────────────────────────────────
router.patch("/gamification-configs/:id", requireAuth, requireTier("agency"), async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    const { label, description, pointValue, active } = req.body;
    const [updated] = await db.update(gamificationConfigsTable)
      .set({ label, description, pointValue, active })
      .where(and(eq(gamificationConfigsTable.id, Number(req.params.id)), eq(gamificationConfigsTable.userId, user.id)))
      .returning();

    if (!updated) { res.status(404).json({ error: "Config not found" }); return; }
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update config" });
  }
});

// ─── POST /reward-tiers ────────────────────────────────────────────────────
router.post("/reward-tiers", requireAuth, requireTier("agency"), async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    const { name, minPoints, maxPoints, badgeColor, rewardDescription } = req.body;
    if (!name || minPoints === undefined) { res.status(400).json({ error: "name and minPoints required" }); return; }

    const [created] = await db.insert(rewardTiersTable)
      .values({ userId: user.id, name, minPoints: Number(minPoints), maxPoints: maxPoints ? Number(maxPoints) : undefined, badgeColor: badgeColor ?? "#6b7280", rewardDescription })
      .returning();
    res.status(201).json(created);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create reward tier" });
  }
});

// ─── PATCH /reward-tiers/:id ───────────────────────────────────────────────
router.patch("/reward-tiers/:id", requireAuth, requireTier("agency"), async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    const { name, minPoints, maxPoints, badgeColor, rewardDescription } = req.body;
    const [updated] = await db.update(rewardTiersTable)
      .set({ name, minPoints: minPoints !== undefined ? Number(minPoints) : undefined, maxPoints: maxPoints !== undefined ? Number(maxPoints) : undefined, badgeColor, rewardDescription })
      .where(and(eq(rewardTiersTable.id, Number(req.params.id)), eq(rewardTiersTable.userId, user.id)))
      .returning();

    if (!updated) { res.status(404).json({ error: "Tier not found" }); return; }
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update reward tier" });
  }
});

// ─── DELETE /reward-tiers/:id ──────────────────────────────────────────────
router.delete("/reward-tiers/:id", requireAuth, requireTier("agency"), async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    await db.delete(rewardTiersTable)
      .where(and(eq(rewardTiersTable.id, Number(req.params.id)), eq(rewardTiersTable.userId, user.id)));
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete reward tier" });
  }
});

// ─── GET /ambassadors/leaderboard/weekly ──────────────────────────────────
router.get("/ambassadors/leaderboard/weekly", requireAuth, requireTier("agency"), async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    const weekStart = new Date();
    weekStart.setHours(0, 0, 0, 0);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // Sunday = start of week

    const weeklyPoints = await db.select({
      ambassadorId: ambassadorPointsTable.ambassadorId,
      weeklyPoints: sql<number>`CAST(SUM(${ambassadorPointsTable.points}) AS INTEGER)`,
    }).from(ambassadorPointsTable)
      .where(and(eq(ambassadorPointsTable.userId, user.id), gte(ambassadorPointsTable.createdAt, weekStart)))
      .groupBy(ambassadorPointsTable.ambassadorId);

    if (weeklyPoints.length === 0) { res.json({ weekStart, leaders: [] }); return; }

    const ambassadorIds = weeklyPoints.map(r => r.ambassadorId);
    const ambassadorRows = await db.select({
      id: ambassadorsTable.id, name: ambassadorsTable.name, state: ambassadorsTable.state,
      zone: ambassadorsTable.zone, tier: ambassadorsTable.tier, avatarInitials: ambassadorsTable.avatarInitials,
    }).from(ambassadorsTable)
      .where(and(eq(ambassadorsTable.userId, user.id), inArray(ambassadorsTable.id, ambassadorIds)));

    const leaders = weeklyPoints
      .map(wp => ({ ...ambassadorRows.find(a => a.id === wp.ambassadorId), weeklyPoints: wp.weeklyPoints }))
      .filter(r => r.id !== undefined)
      .sort((a, b) => b.weeklyPoints - a.weeklyPoints)
      .slice(0, 5);

    res.json({ weekStart, leaders });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to get weekly leaderboard" });
  }
});

// ─── GET /micro-influencers ───────────────────────────────────────────────
router.get("/micro-influencers", requireAuth, requireTier("agency"), async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    let rows = await db.select().from(microInfluencersTable)
      .where(eq(microInfluencersTable.userId, user.id))
      .orderBy(desc(microInfluencersTable.followerCount));

    if (rows.length === 0 && process.env.NODE_ENV !== "production") {
      const [firstAmb] = await db.select().from(ambassadorsTable).where(eq(ambassadorsTable.userId, user.id)).limit(1);
      if (!firstAmb) await seedAmbassadorData(user.id);
      rows = await db.select().from(microInfluencersTable)
        .where(eq(microInfluencersTable.userId, user.id))
        .orderBy(desc(microInfluencersTable.followerCount));
    }

    const { state, niche, platform, status, minFollowers, maxFollowers } = req.query as Record<string, string>;
    if (state) rows = rows.filter(r => r.state === state);
    if (niche) rows = rows.filter(r => r.niche === niche);
    if (platform) rows = rows.filter(r => r.platform === platform);
    if (status) rows = rows.filter(r => r.status === status);
    if (minFollowers) rows = rows.filter(r => r.followerCount >= Number(minFollowers));
    if (maxFollowers) rows = rows.filter(r => r.followerCount <= Number(maxFollowers));

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to list micro-influencers" });
  }
});

// ─── POST /micro-influencers ──────────────────────────────────────────────
router.post("/micro-influencers", requireAuth, requireTier("agency"), async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    const { name, handle, platform, state, zone, niche, followerCount, engagementRate, contactEmail, contactPhone, notes } = req.body;
    if (!name || !handle || !platform || !state || !niche) { res.status(400).json({ error: "name, handle, platform, state, niche required" }); return; }

    const [created] = await db.insert(microInfluencersTable).values({
      userId: user.id, name, handle, platform, state, zone, niche,
      followerCount: followerCount ?? 0, engagementRate: String(engagementRate ?? 0),
      contactEmail, contactPhone, notes,
    }).returning();
    res.status(201).json(created);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to add micro-influencer" });
  }
});

// ─── POST /micro-influencers/:id/outreach ────────────────────────────────
router.post("/micro-influencers/:id/outreach", requireAuth, requireTier("agency"), async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    const [influencer] = await db.select().from(microInfluencersTable)
      .where(and(eq(microInfluencersTable.id, Number(req.params.id)), eq(microInfluencersTable.userId, user.id)));
    if (!influencer) { res.status(404).json({ error: "Influencer not found" }); return; }

    const { campaignBrief } = req.body;

    const outreachDraft = `Hi ${influencer.name.split(" ")[0]}! 👋

My name is [Your Name] from Area Fada OS, representing Charly Boy's brand network.

I came across your ${influencer.platform} page (${influencer.handle}) and love your ${influencer.niche} content — especially how you connect with your ${influencer.state} audience!

We're looking for authentic ${influencer.niche} voices across Nigeria for an exciting collaboration:

${campaignBrief || "We'd love to explore a partnership with you on an upcoming brand activation for Charly Boy's 999 book launch and social media campaigns."}

Your profile:
- ${influencer.followerCount.toLocaleString()} followers on ${influencer.platform}
- ${influencer.engagementRate}% engagement rate
- Based in ${influencer.state} (${influencer.zone})

What we offer:
✅ Competitive creator fee (based on deliverables)
✅ Branded content credit
✅ Access to Area Fada ambassador network
✅ Long-term partnership potential

Are you available for a quick call this week to discuss?

Looking forward to creating together! 🙏🏿

Best,
[Your Name]
Area Fada OS`;

    await db.update(microInfluencersTable)
      .set({ lastContactAt: new Date(), status: "engaged" })
      .where(eq(microInfluencersTable.id, influencer.id));

    res.json({ outreachDraft, influencer });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to generate outreach" });
  }
});

// ─── GET /whatsapp-broadcasts ─────────────────────────────────────────────
router.get("/whatsapp-broadcasts", requireAuth, requireTier("agency"), async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    let rows = await db.select().from(whatsappBroadcastsTable)
      .where(eq(whatsappBroadcastsTable.userId, user.id))
      .orderBy(desc(whatsappBroadcastsTable.broadcastDate));

    if (rows.length === 0 && process.env.NODE_ENV !== "production") {
      const [firstAmb] = await db.select().from(ambassadorsTable).where(eq(ambassadorsTable.userId, user.id)).limit(1);
      if (!firstAmb) await seedAmbassadorData(user.id);
      rows = await db.select().from(whatsappBroadcastsTable)
        .where(eq(whatsappBroadcastsTable.userId, user.id))
        .orderBy(desc(whatsappBroadcastsTable.broadcastDate));
    }

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to list broadcasts" });
  }
});

// ─── POST /whatsapp-broadcasts ────────────────────────────────────────────
router.post("/whatsapp-broadcasts", requireAuth, requireTier("agency"), async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    const { listName, message, sentCount, deliveryCount, linkClicks, responseCount, broadcastDate, notes } = req.body;
    if (!listName || !message || !broadcastDate) { res.status(400).json({ error: "listName, message, broadcastDate required" }); return; }

    const [created] = await db.insert(whatsappBroadcastsTable).values({
      userId: user.id, listName, message,
      sentCount: sentCount ?? 0, deliveryCount: deliveryCount ?? 0,
      linkClicks: linkClicks ?? 0, responseCount: responseCount ?? 0,
      broadcastDate: new Date(broadcastDate), notes,
    }).returning();

    res.status(201).json(created);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to log broadcast" });
  }
});

// ─── DELETE /whatsapp-broadcasts/:id ─────────────────────────────────────
router.delete("/whatsapp-broadcasts/:id", requireAuth, requireTier("agency"), async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    await db.delete(whatsappBroadcastsTable)
      .where(and(eq(whatsappBroadcastsTable.id, Number(req.params.id)), eq(whatsappBroadcastsTable.userId, user.id)));
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete broadcast" });
  }
});

// ─── GET /ambassadors/widget (PUBLIC — tenant-scoped by token) ────────────
router.get("/ambassadors/widget", async (req: any, res): Promise<void> => {
  try {
    const token = (req.query.token as string | undefined)?.trim();
    if (!token) {
      res.status(400).send("<p style='font-family:sans-serif;padding:16px;color:#ef4444;'>Missing token. Use the embed code from your Ambassador CRM dashboard.</p>");
      return;
    }

    // Look up the tenant by Clerk ID (token = Clerk user ID — long opaque string)
    const [dbUser] = await db.select({ id: usersTable.id }).from(usersTable)
      .where(eq(usersTable.clerkId, token));
    if (!dbUser) {
      res.status(404).send("<p style='font-family:sans-serif;padding:16px;color:#ef4444;'>Leaderboard not found.</p>");
      return;
    }

    // Fetch top 10 for this tenant only
    const rows = await db.select({
      id: ambassadorsTable.id,
      name: ambassadorsTable.name,
      state: ambassadorsTable.state,
      zone: ambassadorsTable.zone,
      tier: ambassadorsTable.tier,
      totalPoints: ambassadorsTable.totalPoints,
      avatarInitials: ambassadorsTable.avatarInitials,
    }).from(ambassadorsTable)
      .where(and(eq(ambassadorsTable.userId, dbUser.id), eq(ambassadorsTable.status, "active")))
      .orderBy(desc(ambassadorsTable.totalPoints))
      .limit(10);

    const zoneColor: Record<string, string> = {
      "South West": "#10b981",
      "South East": "#3b82f6",
      "South South": "#06b6d4",
      "North West": "#f97316",
      "North East": "#ef4444",
      "North Central": "#a855f7",
    };
    const tierIcon: Record<string, string> = { gold: "🥇", silver: "🥈", bronze: "🥉", member: "" };
    const medalIcons = ["🥇", "🥈", "🥉"];

    const rows_html = rows.map((a, i) => {
      const initials = esc(a.avatarInitials ?? a.name.slice(0, 2).toUpperCase());
      const name = esc(a.name);
      const state = esc(a.state);
      const zone = esc(a.zone);
      const color = esc(zoneColor[a.zone] ?? "#6b7280");
      const medal = medalIcons[i] ?? `<span style="color:#94a3b8;font-size:13px;font-family:monospace;">${i + 1}</span>`;
      return `
      <div class="row" style="display:flex;align-items:center;gap:12px;padding:10px 16px;border-bottom:1px solid #f1f5f9;transition:background 0.15s;">
        <span style="font-size:18px;width:24px;text-align:center;flex-shrink:0;">${medal}</span>
        <div style="width:36px;height:36px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:12px;flex-shrink:0;">${initials}</div>
        <div style="flex:1;min-width:0;">
          <div style="font-weight:600;font-size:13px;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${name}</div>
          <div style="font-size:11px;color:#64748b;margin-top:1px;">${state} · ${zone}</div>
        </div>
        <div style="text-align:right;flex-shrink:0;">
          <div style="font-weight:700;font-size:14px;color:#0f172a;">${a.totalPoints.toLocaleString()}</div>
          <div style="font-size:11px;color:#94a3b8;">pts ${esc(tierIcon[a.tier] ?? "")}</div>
        </div>
      </div>`;
    }).join("");

    const emptyHtml = rows.length === 0
      ? `<div style="padding:32px 16px;text-align:center;color:#94a3b8;font-size:13px;">No ambassadors yet — check back soon.</div>`
      : "";

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Area Fada Ambassador Leaderboard</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f8fafc;min-height:100vh;}
.row:last-child{border-bottom:none!important;}
.row:hover{background:#f1f5f9;}
</style>
</head>
<body>
<div style="background:hsl(152,80%,36%);padding:14px 16px 12px;">
  <div style="display:flex;align-items:center;gap:10px;">
    <span style="font-size:22px;line-height:1;">🏆</span>
    <div>
      <div style="font-weight:800;font-size:15px;color:#fff;letter-spacing:-0.01em;">Ambassador Leaderboard</div>
      <div style="font-size:11px;color:rgba(255,255,255,0.75);margin-top:1px;">Top 10 · refreshes every 60 s</div>
    </div>
  </div>
</div>
<div style="background:#fff;border-radius:0 0 8px 8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.06);">
${rows_html || emptyHtml}
</div>
<div style="padding:10px 16px;text-align:center;">
  <a href="https://areafada.com" target="_blank" rel="noopener" style="font-size:10px;color:#94a3b8;text-decoration:none;letter-spacing:0.02em;">Powered by <span style="color:hsl(152,80%,36%);font-weight:600;">Area Fada OS</span></a>
</div>
<script>setTimeout(()=>location.reload(),60000);</script>
</body>
</html>`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.removeHeader("X-Frame-Options");
    res.setHeader("Content-Security-Policy", "frame-ancestors *");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.send(html);
  } catch (err) {
    console.error(err);
    res.status(500).send("<p>Error loading leaderboard</p>");
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC AMBASSADOR PORTAL — no requireAuth, no requireTier
// ═══════════════════════════════════════════════════════════════════════════

const resendClient = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

function portalToken(): string {
  return randomUUID();
}

// ─── POST /ambassador-portal/apply ───────────────────────────────────────
// Body: { tenant, name, email, phone, state, zone, platform, handle, followerCount }
// `tenant` is the agency's Clerk user ID (same scheme as /ambassadors/widget)
router.post("/ambassador-portal/apply", async (req: any, res): Promise<void> => {
  try {
    const { tenant, name, email, phone, state, zone, platform, handle, followerCount } = req.body;
    if (!tenant || !name || !email || !state || !zone) {
      res.status(400).json({ error: "tenant, name, email, state, zone are required" });
      return;
    }

    const [dbUser] = await db.select({ id: usersTable.id })
      .from(usersTable).where(eq(usersTable.clerkId, tenant)).limit(1);
    if (!dbUser) { res.status(404).json({ error: "Organisation not found" }); return; }

    // Prevent duplicate applications by email for this tenant
    const [existing] = await db.select({ id: ambassadorsTable.id, status: ambassadorsTable.status, portalToken: ambassadorsTable.portalToken })
      .from(ambassadorsTable)
      .where(and(eq(ambassadorsTable.userId, dbUser.id), eq(ambassadorsTable.email, email.trim().toLowerCase())))
      .limit(1);

    if (existing) {
      res.json({
        alreadyApplied: true,
        status: existing.status,
        message: existing.status === "pending"
          ? "An application already exists for this email. Check your email for your access token, or use the 'Already applied?' lookup below."
          : existing.status === "active"
            ? "Your application has been approved! Use the access token from your confirmation email to open your dashboard."
            : "An application already exists for this email. Contact your coordinator for assistance.",
      });
      return;
    }

    const token = portalToken();
    const [created] = await db.insert(ambassadorsTable).values({
      userId: dbUser.id,
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone?.trim() ?? null,
      state,
      zone,
      platform: platform ?? null,
      handle: handle?.trim() ?? null,
      followerCount: followerCount ? Number(followerCount) : 0,
      avatarInitials: initials(name.trim()),
      status: "pending",
      portalToken: token,
    }).returning();

    // Send confirmation email (best-effort — never blocks the response)
    const portalUrl = `https://areafada.os/ambassador-portal?tenant=${tenant}`;
    const emailText = `Hi ${created.name},\n\nThank you for applying to the Area Fada Ambassador Network!\n\nYour application is now under review. Once approved you'll have full access to your points dashboard and assigned tasks.\n\nYour access token (save this — you'll need it to log back in):\n${created.portalToken}\n\nCheck your application status at:\n${portalUrl}\n\nEnter your access token when prompted.\n\n— Area Fada OS`;
    const emailHtml = `<p>Hi <strong>${esc(created.name)}</strong>,</p><p>Thank you for applying to the <strong>Area Fada Ambassador Network</strong>!</p><p>Your application is now under review. Once approved you'll have full access to your points dashboard, tier progress, and assigned tasks.</p><p><strong>Your access token (save this):</strong></p><pre style="background:#f4f4f4;padding:12px;border-radius:6px;font-size:14px;">${esc(created.portalToken ?? "")}</pre><p>Check your status at: <a href="${esc(portalUrl)}">${esc(portalUrl)}</a></p><p>— Area Fada OS</p>`;
    if (resendClient) {
      resendClient.emails.send({
        from: "Area Fada OS <noreply@areafada.ng>",
        to: [created.email],
        subject: "Application received — Area Fada Ambassador Network",
        text: emailText,
        html: emailHtml,
      }).catch(err => console.error("[ambassador-portal] email send failed:", err));
    } else {
      console.info(`[ambassador-portal] email queued (no RESEND_API_KEY): to=${created.email} ambassadorId=${created.id}`);
    }

    res.status(201).json({
      success: true,
      token: created.portalToken,
      status: created.status,
      message: "Application submitted! Check your email for your access token, or save it from this page.",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to submit application" });
  }
});

// ─── GET /ambassador-portal/me?token= ────────────────────────────────────
router.get("/ambassador-portal/me", async (req: any, res): Promise<void> => {
  try {
    const token = (req.query.token as string | undefined)?.trim();
    if (!token) { res.status(400).json({ error: "token required" }); return; }

    const [amb] = await db.select().from(ambassadorsTable)
      .where(eq(ambassadorsTable.portalToken, token)).limit(1);
    if (!amb) { res.status(404).json({ error: "Ambassador not found" }); return; }

    res.json(amb);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load profile" });
  }
});

// ─── GET /ambassador-portal/points?token= ────────────────────────────────
router.get("/ambassador-portal/points", async (req: any, res): Promise<void> => {
  try {
    const token = (req.query.token as string | undefined)?.trim();
    if (!token) { res.status(400).json({ error: "token required" }); return; }

    const [amb] = await db.select({ id: ambassadorsTable.id, userId: ambassadorsTable.userId, status: ambassadorsTable.status })
      .from(ambassadorsTable).where(eq(ambassadorsTable.portalToken, token)).limit(1);
    if (!amb) { res.status(404).json({ error: "Ambassador not found" }); return; }
    if (amb.status !== "active") { res.status(403).json({ error: "Account not yet active" }); return; }

    const points = await db.select().from(ambassadorPointsTable)
      .where(eq(ambassadorPointsTable.ambassadorId, amb.id))
      .orderBy(desc(ambassadorPointsTable.createdAt))
      .limit(50);

    res.json(points);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load points" });
  }
});

// ─── GET /ambassador-portal/tasks?token= ─────────────────────────────────
router.get("/ambassador-portal/tasks", async (req: any, res): Promise<void> => {
  try {
    const token = (req.query.token as string | undefined)?.trim();
    if (!token) { res.status(400).json({ error: "token required" }); return; }

    const [amb] = await db.select({ id: ambassadorsTable.id, userId: ambassadorsTable.userId, state: ambassadorsTable.state, zone: ambassadorsTable.zone, tier: ambassadorsTable.tier, status: ambassadorsTable.status })
      .from(ambassadorsTable).where(eq(ambassadorsTable.portalToken, token)).limit(1);
    if (!amb) { res.status(404).json({ error: "Ambassador not found" }); return; }
    if (amb.status !== "active") { res.status(403).json({ error: "Account not yet active" }); return; }

    const allTasks = await db.select().from(ambassadorTasksTable)
      .where(and(eq(ambassadorTasksTable.userId, amb.userId), eq(ambassadorTasksTable.status, "active")))
      .orderBy(desc(ambassadorTasksTable.createdAt));

    // Filter tasks applicable to this ambassador (targetGroup + targetStates)
    const myTasks = allTasks.filter(task => {
      const tg = task.targetGroup ?? "all";
      const states = (task.targetStates as string[] | null) ?? [];

      // targetGroup filter
      let groupMatch = false;
      if (tg === "all") groupMatch = true;
      else if (tg.startsWith("zone:") && tg.replace("zone:", "") === amb.zone) groupMatch = true;
      else if (tg.startsWith("tier:") && tg.replace("tier:", "") === amb.tier) groupMatch = true;

      if (!groupMatch) return false;

      // targetStates filter: if states list is non-empty, ambassador's state must be in it
      if (states.length > 0 && !states.includes(amb.state)) return false;

      return true;
    });

    // Check which ones are already completed by this ambassador
    const completedIds = myTasks.length > 0
      ? (await db.select({ taskId: taskCompletionsTable.taskId })
          .from(taskCompletionsTable)
          .where(eq(taskCompletionsTable.ambassadorId, amb.id)))
          .map(r => r.taskId)
      : [];

    res.json(myTasks.map(t => ({ ...t, completed: completedIds.includes(t.id) })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load tasks" });
  }
});

// ─── GET /ambassador-portal/tiers?token= ─────────────────────────────────
router.get("/ambassador-portal/tiers", async (req: any, res): Promise<void> => {
  try {
    const token = (req.query.token as string | undefined)?.trim();
    if (!token) { res.status(400).json({ error: "token required" }); return; }

    const [amb] = await db.select({ userId: ambassadorsTable.userId })
      .from(ambassadorsTable).where(eq(ambassadorsTable.portalToken, token)).limit(1);
    if (!amb) { res.status(404).json({ error: "Ambassador not found" }); return; }

    const tiers = await db.select().from(rewardTiersTable)
      .where(eq(rewardTiersTable.userId, amb.userId))
      .orderBy(rewardTiersTable.minPoints);

    res.json(tiers);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load tiers" });
  }
});

// ─── GET /ambassador-portal/leaderboard?token= ───────────────────────────
router.get("/ambassador-portal/leaderboard", async (req: any, res): Promise<void> => {
  try {
    const token = (req.query.token as string | undefined)?.trim();
    if (!token) { res.status(400).json({ error: "token required" }); return; }

    const [amb] = await db.select({ userId: ambassadorsTable.userId, status: ambassadorsTable.status })
      .from(ambassadorsTable).where(eq(ambassadorsTable.portalToken, token)).limit(1);
    if (!amb) { res.status(404).json({ error: "Ambassador not found" }); return; }
    if (amb.status !== "active") { res.status(403).json({ error: "Account not yet active" }); return; }

    const top = await db.select({
      id: ambassadorsTable.id,
      name: ambassadorsTable.name,
      state: ambassadorsTable.state,
      tier: ambassadorsTable.tier,
      totalPoints: ambassadorsTable.totalPoints,
      avatarInitials: ambassadorsTable.avatarInitials,
    }).from(ambassadorsTable)
      .where(and(eq(ambassadorsTable.userId, amb.userId), eq(ambassadorsTable.status, "active")))
      .orderBy(desc(ambassadorsTable.totalPoints))
      .limit(10);

    res.json(top.map((a, i) => ({ ...a, rank: i + 1 })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load leaderboard" });
  }
});

export default router;
