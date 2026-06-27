import { Router } from "express";
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
import { eq, desc, and, gte, ilike, sql } from "drizzle-orm";
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
      `${i + 1},"${a.name}","${a.state}","${a.zone}","${a.tier}",${a.totalPoints},${a.tasksCompleted},${a.referrals},"${a.platform ?? ""}","${a.handle ?? ""}","${a.status}"`
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
    const tier = newTotal >= 4000 ? "gold" : newTotal >= 2000 ? "silver" : newTotal >= 800 ? "bronze" : "member";
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

    const [task] = await db.select().from(ambassadorTasksTable)
      .where(and(eq(ambassadorTasksTable.id, taskId), eq(ambassadorTasksTable.userId, user.id)));
    if (!task) { res.status(404).json({ error: "Task not found" }); return; }

    // Check not already completed
    const [existing] = await db.select().from(taskCompletionsTable)
      .where(and(eq(taskCompletionsTable.taskId, taskId), eq(taskCompletionsTable.ambassadorId, ambassadorId)));
    if (existing) { res.status(409).json({ error: "Already completed by this ambassador" }); return; }

    await db.insert(taskCompletionsTable).values({ taskId, ambassadorId, userId: user.id, notes });
    await db.update(ambassadorTasksTable)
      .set({ completedCount: task.completedCount + 1 })
      .where(eq(ambassadorTasksTable.id, taskId));

    if (task.pointReward > 0) {
      // userId scope enforced — ambassador must belong to this user
      const [amb] = await db.select().from(ambassadorsTable)
        .where(and(eq(ambassadorsTable.id, ambassadorId), eq(ambassadorsTable.userId, user.id)));
      if (!amb) { res.status(403).json({ error: "Ambassador not found or access denied" }); return; }
      const newTotal = amb.totalPoints + task.pointReward;
      const tier = newTotal >= 4000 ? "gold" : newTotal >= 2000 ? "silver" : newTotal >= 800 ? "bronze" : "member";
      await db.insert(ambassadorPointsTable).values({ ambassadorId, userId: user.id, action: "task_complete", points: task.pointReward, description: `Completed: ${task.title}` });
      await db.update(ambassadorsTable).set({ totalPoints: newTotal, tier, tasksCompleted: amb.tasksCompleted + 1 }).where(eq(ambassadorsTable.id, ambassadorId));
    } else {
      // Even with 0 points, verify ambassador belongs to this user
      const [amb] = await db.select({ id: ambassadorsTable.id }).from(ambassadorsTable)
        .where(and(eq(ambassadorsTable.id, ambassadorId), eq(ambassadorsTable.userId, user.id)));
      if (!amb) { res.status(403).json({ error: "Ambassador not found or access denied" }); return; }
    }

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

// ─── GET /ambassadors/widget (PUBLIC — no auth) ───────────────────────────
router.get("/ambassadors/widget", async (_req: any, res): Promise<void> => {
  try {
    // Fetch top 10 across all users — public display, no PII beyond name/state/points
    const rows = await db.select({
      id: ambassadorsTable.id,
      name: ambassadorsTable.name,
      state: ambassadorsTable.state,
      zone: ambassadorsTable.zone,
      tier: ambassadorsTable.tier,
      totalPoints: ambassadorsTable.totalPoints,
      avatarInitials: ambassadorsTable.avatarInitials,
    }).from(ambassadorsTable)
      .where(eq(ambassadorsTable.status, "active"))
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

    const rows_html = rows.map((a, i) => `
      <div style="display:flex;align-items:center;gap:12px;padding:10px 16px;border-bottom:1px solid #f1f5f9;">
        <span style="font-size:18px;width:24px;text-align:center;">${medalIcons[i] ?? `<span style="color:#94a3b8;font-size:13px;font-family:monospace;">${i + 1}</span>`}</span>
        <div style="width:36px;height:36px;border-radius:50%;background:${zoneColor[a.zone] ?? "#6b7280"};display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:12px;flex-shrink:0;">${a.avatarInitials ?? a.name.slice(0, 2).toUpperCase()}</div>
        <div style="flex:1;min-width:0;">
          <div style="font-weight:600;font-size:13px;color:#0f172a;">${a.name}</div>
          <div style="font-size:11px;color:#64748b;">${a.state} · ${a.zone}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-weight:700;font-size:14px;color:#0f172a;">${a.totalPoints.toLocaleString()}</div>
          <div style="font-size:11px;color:#94a3b8;">pts ${tierIcon[a.tier] ?? ""}</div>
        </div>
      </div>`).join("");

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Area Fada Ambassador Leaderboard</title>
<style>*{box-sizing:border-box;margin:0;padding:0;}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#fff;}</style>
</head>
<body>
<div style="padding:16px 16px 8px;border-bottom:2px solid #0f172a;">
  <div style="display:flex;align-items:center;gap:8px;">
    <span style="font-size:20px;">🏆</span>
    <div>
      <div style="font-weight:800;font-size:15px;color:#0f172a;">Area Fada Ambassador Leaderboard</div>
      <div style="font-size:11px;color:#64748b;">Top 10 · Updated live</div>
    </div>
  </div>
</div>
${rows_html}
<div style="padding:8px 16px;text-align:center;">
  <a href="https://areafada.os" target="_blank" style="font-size:10px;color:#94a3b8;text-decoration:none;">Powered by Area Fada OS</a>
</div>
<script>setTimeout(()=>location.reload(),60000);</script>
</body>
</html>`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("X-Frame-Options", "ALLOWALL");
    res.setHeader("Content-Security-Policy", "frame-ancestors *");
    res.send(html);
  } catch (err) {
    console.error(err);
    res.status(500).send("<p>Error loading leaderboard</p>");
  }
});

export default router;
