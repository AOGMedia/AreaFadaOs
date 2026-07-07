import { Router } from "express";
import { db } from "@workspace/db";
import {
  fanProfilesTable,
  fanTierHistoryTable,
  fanPointsLedgerTable,
  fanChallengesTable,
  challengeSubmissionsTable,
  contentVaultItemsTable,
  merchDiscountCodesTable,
  ogInviteListTable,
  usersTable,
} from "@workspace/db";
import { eq, desc, asc, and, ilike, sql } from "drizzle-orm";
import { requireAuth } from "./users";
import { requireTier } from "../middlewares/tierGuard";

const router = Router();

async function getDbUser(clerkId: string) {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId)).limit(1);
  return user ?? null;
}

function nanoid(len = 8): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

// Recompute tier based on points, referrals, purchase
function computeFanTier(fan: { totalPoints: number; referralCount: number; purchaseVerified: boolean }): number {
  if (fan.totalPoints >= 1000 && fan.referralCount >= 3 && fan.purchaseVerified) return 3;
  if (fan.purchaseVerified) return 2;
  return 1;
}

// ── Seed ─────────────────────────────────────────────────────────────────────

const NIGERIAN_NAMES = [
  "Chukwuemeka Obi", "Fatimah Suleiman", "Oluwaseun Adeyemi", "Blessing Okafor",
  "Musa Abubakar", "Ngozi Eze", "Kehinde Olawale", "Aisha Bello",
  "Chidi Nwachukwu", "Halima Yusuf", "Tokunbo Femi", "Amina Garba",
  "Emeka Anyanwu", "Kemi Adebayo", "Ibrahim Danladi", "Chioma Nwosu",
  "Bayo Olatunji", "Nkechi Onyeka", "Sadiq Haruna", "Funke Adesanya",
  "Obinna Ike", "Yetunde Afolabi", "Usman Rabiu", "Adaeze Okonkwo",
  "Taiwo Babatunde", "Rukayat Salami", "Ifeanyi Okafor", "Temitope Bello",
  "Kabir Musa", "Adaobi Eze",
];
const STATES = ["Lagos", "Abuja", "Kano", "Rivers", "Oyo", "Delta", "Anambra", "Kaduna", "Enugu", "Imo"];

async function seedFanHubData(userId: number) {
  const fans: typeof fanProfilesTable.$inferInsert[] = NIGERIAN_NAMES.map((name, i) => {
    const tier = i < 5 ? 4 : i < 12 ? 3 : i < 20 ? 2 : 1;
    return {
      userId,
      email: `${name.toLowerCase().replace(/ /g, ".")}@example.com`,
      displayName: name,
      phone: `080${String(Math.floor(10000000 + Math.random() * 89999999))}`,
      state: STATES[i % STATES.length],
      instagramHandle: `@${name.split(" ")[0].toLowerCase()}`,
      referralCode: nanoid(8),
      fanTier: tier,
      totalPoints: tier === 4 ? 1200 + i * 80 : tier === 3 ? 500 + i * 40 : tier === 2 ? 100 + i * 20 : i * 10,
      referralCount: tier === 4 ? 6 + i : tier === 3 ? 3 + i : tier === 2 ? 1 : 0,
      purchaseVerified: tier >= 2,
    };
  });
  await db.insert(fanProfilesTable).values(fans);

  const insertedFans = await db.select().from(fanProfilesTable).where(eq(fanProfilesTable.userId, userId)).limit(5);
  if (insertedFans.length === 0) return;

  await db.insert(fanChallengesTable).values([
    { userId, title: "Share '999' teaser and tag 3 friends", description: "Post the teaser video on your IG Story and tag at least 3 people. Submit a screenshot.", pointValue: 100, proofType: "screenshot", status: "active" },
    { userId, title: "Write a review of '999' on your timeline", description: "Post an honest review of the book on Facebook or Twitter. Submit the link.", pointValue: 150, proofType: "link", status: "active" },
    { userId, title: "Refer a verified buyer using your referral link", description: "Share your unique referral link. When someone buys using it, you get points automatically.", pointValue: 200, proofType: "text", status: "active" },
    { userId, title: "Create a TikTok or Reel featuring Charly Boy", description: "Make a short video featuring the '999' book or Charly Boy content. Submit the video link.", pointValue: 250, proofType: "link", status: "active" },
    { userId, title: "Attend an Area Fada meetup in your city", description: "Attend any official or fan-organized Area Fada meetup and submit a selfie from the event.", pointValue: 300, proofType: "screenshot", status: "active" },
  ]);

  await db.insert(contentVaultItemsTable).values([
    { userId, title: "999 — Chapter 1 (Free Preview)", description: "Read the first chapter of '999' for free. Available to all fans.", contentType: "chapter", accessTier: 1, contentUrl: "https://example.com/vault/ch1", active: true },
    { userId, title: "Bonus Chapter: The Untold Story", description: "Exclusive chapter only for verified book buyers.", contentType: "chapter", accessTier: 2, contentUrl: "https://example.com/vault/bonus-ch", active: true },
    { userId, title: "Behind the Scenes: Recording '999'", description: "Exclusive BTS video from the recording sessions.", contentType: "video", accessTier: 2, contentUrl: "https://example.com/vault/bts", active: true },
    { userId, title: "Charly Boy Voice Note — Message to Soldiers", description: "Personal voice note from Charly Boy to Tier 3 fans.", contentType: "audio", accessTier: 3, contentUrl: "https://example.com/vault/voice-note", active: true },
    { userId, title: "Unreleased Track — Area Fada Anthem", description: "Exclusive unreleased music only for OG members.", contentType: "audio", accessTier: 4, contentUrl: "https://example.com/vault/anthem", active: true },
    { userId, title: "Co-Creator Pitch Deck", description: "Opportunities for OG fans to collaborate on upcoming projects.", contentType: "doc", accessTier: 4, contentUrl: "https://example.com/vault/pitch-deck", active: true },
  ]);

  for (const fan of insertedFans.slice(0, 3)) {
    const code = `AREAFADA-${nanoid(6)}`;
    await db.insert(merchDiscountCodesTable).values({ userId, fanProfileId: fan.id, code, discountPercent: fan.fanTier >= 4 ? 20 : 15 });
  }

  for (const fan of insertedFans.slice(0, 2)) {
    await db.insert(ogInviteListTable).values({
      userId,
      fanProfileId: fan.id,
      status: "invited",
      inviteLink: `https://chat.whatsapp.com/areafadaog-${nanoid(12).toLowerCase()}`,
      invitedAt: new Date(),
    });
  }
}

// ── Fan Profiles ──────────────────────────────────────────────────────────────

router.get("/fan-hub/profiles", requireAuth, requireTier("agency"), async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    let rows = await db.select().from(fanProfilesTable)
      .where(eq(fanProfilesTable.userId, user.id))
      .orderBy(desc(fanProfilesTable.totalPoints));

    if (rows.length === 0 && process.env.NODE_ENV !== "production") {
      await seedFanHubData(user.id);
      rows = await db.select().from(fanProfilesTable)
        .where(eq(fanProfilesTable.userId, user.id))
        .orderBy(desc(fanProfilesTable.totalPoints));
    }

    const { tier, search } = req.query as { tier?: string; search?: string };
    if (tier) rows = rows.filter(r => r.fanTier === Number(tier));
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(r => r.displayName.toLowerCase().includes(q) || r.email.toLowerCase().includes(q));
    }

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to list fan profiles" });
  }
});

router.post("/fan-hub/profiles", requireAuth, requireTier("agency"), async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    const { email, displayName, phone, state, instagramHandle, twitterHandle, tiktokHandle, referredByCode } = req.body;
    if (!email || !displayName) { res.status(400).json({ error: "email and displayName are required" }); return; }

    const referralCode = nanoid(8);
    const [fan] = await db.insert(fanProfilesTable).values({
      userId: user.id,
      email,
      displayName,
      phone,
      state,
      instagramHandle,
      twitterHandle,
      tiktokHandle,
      referralCode,
      referredByCode,
      fanTier: 1,
    }).returning();

    // Award referral points to referrer if code provided
    if (referredByCode) {
      const [referrer] = await db.select().from(fanProfilesTable)
        .where(and(eq(fanProfilesTable.userId, user.id), eq(fanProfilesTable.referralCode, referredByCode)))
        .limit(1);
      if (referrer) {
        await db.update(fanProfilesTable)
          .set({ referralCount: referrer.referralCount + 1, totalPoints: referrer.totalPoints + 200 })
          .where(eq(fanProfilesTable.id, referrer.id));
        await db.insert(fanPointsLedgerTable).values({
          fanProfileId: referrer.id,
          userId: user.id,
          action: "referral_signup",
          points: 200,
          description: `Referred new fan: ${displayName}`,
        });
      }
    }

    res.status(201).json(fan);
  } catch (err) {
    res.status(500).json({ error: "Failed to register fan" });
  }
});

router.get("/fan-hub/profiles/me", requireAuth, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    const [fan] = await db.select().from(fanProfilesTable)
      .where(and(eq(fanProfilesTable.userId, user.id), eq(fanProfilesTable.email, user.email ?? "")))
      .limit(1);

    if (!fan) { res.status(404).json({ error: "Not registered as a fan" }); return; }
    res.json(fan);
  } catch (err) {
    res.status(500).json({ error: "Failed to get fan profile" });
  }
});

router.patch("/fan-hub/profiles/:id", requireAuth, requireTier("agency"), async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    const id = Number(req.params.id);
    const [existing] = await db.select().from(fanProfilesTable)
      .where(and(eq(fanProfilesTable.id, id), eq(fanProfilesTable.userId, user.id)))
      .limit(1);
    if (!existing) { res.status(404).json({ error: "Fan not found" }); return; }

    const { purchaseVerified, fanTier, state, phone, instagramHandle, twitterHandle, tiktokHandle } = req.body;
    const updates: Partial<typeof fanProfilesTable.$inferInsert> = {};
    if (purchaseVerified !== undefined) updates.purchaseVerified = purchaseVerified;
    if (fanTier !== undefined) updates.fanTier = fanTier;
    if (state !== undefined) updates.state = state;
    if (phone !== undefined) updates.phone = phone;
    if (instagramHandle !== undefined) updates.instagramHandle = instagramHandle;
    if (twitterHandle !== undefined) updates.twitterHandle = twitterHandle;
    if (tiktokHandle !== undefined) updates.tiktokHandle = tiktokHandle;

    const [updated] = await db.update(fanProfilesTable).set(updates).where(eq(fanProfilesTable.id, id)).returning();

    // Log tier change if tier changed
    if (fanTier !== undefined && fanTier !== existing.fanTier) {
      await db.insert(fanTierHistoryTable).values({
        fanProfileId: id,
        userId: user.id,
        fromTier: existing.fanTier,
        toTier: fanTier,
        reason: "Admin manual update",
      });
    }

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: "Failed to update fan profile" });
  }
});

// ── Leaderboard ───────────────────────────────────────────────────────────────

router.get("/fan-hub/leaderboard", requireAuth, requireTier("agency"), async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    const fans = await db.select().from(fanProfilesTable)
      .where(eq(fanProfilesTable.userId, user.id))
      .orderBy(desc(fanProfilesTable.totalPoints))
      .limit(100);

    const leaderboard = fans.map((f, i) => ({
      rank: i + 1,
      fanProfileId: f.id,
      displayName: f.displayName,
      state: f.state,
      fanTier: f.fanTier,
      totalPoints: f.totalPoints,
      referralCount: f.referralCount,
      purchaseVerified: f.purchaseVerified,
    }));

    res.json(leaderboard);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch leaderboard" });
  }
});

// ── Challenges ────────────────────────────────────────────────────────────────

router.get("/fan-hub/challenges", requireAuth, requireTier("agency"), async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    let rows = await db.select().from(fanChallengesTable)
      .where(eq(fanChallengesTable.userId, user.id))
      .orderBy(desc(fanChallengesTable.createdAt));

    if (rows.length === 0 && process.env.NODE_ENV !== "production") {
      // Seed happens via profiles endpoint, but ensure challenges exist
      const fans = await db.select().from(fanProfilesTable).where(eq(fanProfilesTable.userId, user.id)).limit(1);
      if (fans.length === 0) {
        await seedFanHubData(user.id);
        rows = await db.select().from(fanChallengesTable).where(eq(fanChallengesTable.userId, user.id)).orderBy(desc(fanChallengesTable.createdAt));
      }
    }

    const { status } = req.query as { status?: string };
    if (status) rows = rows.filter(r => r.status === status);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to list challenges" });
  }
});

router.post("/fan-hub/challenges", requireAuth, requireTier("agency"), async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    const { title, description, pointValue, deadline, proofType, status } = req.body;
    if (!title) { res.status(400).json({ error: "title is required" }); return; }

    const [challenge] = await db.insert(fanChallengesTable).values({
      userId: user.id,
      title,
      description,
      pointValue: pointValue ?? 50,
      deadline: deadline ? new Date(deadline) : undefined,
      proofType: proofType ?? "text",
      status: status ?? "active",
    }).returning();

    res.status(201).json(challenge);
  } catch (err) {
    res.status(500).json({ error: "Failed to create challenge" });
  }
});

router.patch("/fan-hub/challenges/:id", requireAuth, requireTier("agency"), async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    const id = Number(req.params.id);
    const { title, description, pointValue, deadline, proofType, status } = req.body;
    const [updated] = await db.update(fanChallengesTable)
      .set({ title, description, pointValue, deadline: deadline ? new Date(deadline) : undefined, proofType, status })
      .where(and(eq(fanChallengesTable.id, id), eq(fanChallengesTable.userId, user.id)))
      .returning();
    if (!updated) { res.status(404).json({ error: "Not found" }); return; }
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: "Failed to update challenge" });
  }
});

router.delete("/fan-hub/challenges/:id", requireAuth, requireTier("agency"), async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    await db.delete(fanChallengesTable)
      .where(and(eq(fanChallengesTable.id, Number(req.params.id)), eq(fanChallengesTable.userId, user.id)));
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: "Failed to delete challenge" });
  }
});

// ── Challenge Submissions ─────────────────────────────────────────────────────

router.post("/fan-hub/challenges/:id/submit", requireAuth, requireTier("agency"), async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    const challengeId = Number(req.params.id);
    const { proofText, proofUrl, fanProfileId } = req.body;
    if (!fanProfileId) { res.status(400).json({ error: "fanProfileId is required" }); return; }

    const [submission] = await db.insert(challengeSubmissionsTable).values({
      challengeId,
      fanProfileId: Number(fanProfileId),
      userId: user.id,
      proofText,
      proofUrl,
      status: "pending",
    }).returning();

    // Increment participant count
    await db.update(fanChallengesTable)
      .set({ participantCount: sql`${fanChallengesTable.participantCount} + 1` })
      .where(eq(fanChallengesTable.id, challengeId));

    res.status(201).json(submission);
  } catch (err) {
    res.status(500).json({ error: "Failed to submit challenge proof" });
  }
});

router.get("/fan-hub/submissions", requireAuth, requireTier("agency"), async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    const rows = await db.select({
      id: challengeSubmissionsTable.id,
      challengeId: challengeSubmissionsTable.challengeId,
      fanProfileId: challengeSubmissionsTable.fanProfileId,
      userId: challengeSubmissionsTable.userId,
      proofText: challengeSubmissionsTable.proofText,
      proofUrl: challengeSubmissionsTable.proofUrl,
      status: challengeSubmissionsTable.status,
      reviewNote: challengeSubmissionsTable.reviewNote,
      reviewedAt: challengeSubmissionsTable.reviewedAt,
      createdAt: challengeSubmissionsTable.createdAt,
      fanDisplayName: fanProfilesTable.displayName,
      challengeTitle: fanChallengesTable.title,
    })
      .from(challengeSubmissionsTable)
      .leftJoin(fanProfilesTable, eq(challengeSubmissionsTable.fanProfileId, fanProfilesTable.id))
      .leftJoin(fanChallengesTable, eq(challengeSubmissionsTable.challengeId, fanChallengesTable.id))
      .where(eq(challengeSubmissionsTable.userId, user.id))
      .orderBy(desc(challengeSubmissionsTable.createdAt));

    const { status } = req.query as { status?: string };
    const filtered = status ? rows.filter(r => r.status === status) : rows;
    res.json(filtered);
  } catch (err) {
    res.status(500).json({ error: "Failed to list submissions" });
  }
});

router.patch("/fan-hub/submissions/:id/review", requireAuth, requireTier("agency"), async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    const id = Number(req.params.id);
    const { status, reviewNote } = req.body;
    if (!status || !["approved", "rejected"].includes(status)) {
      res.status(400).json({ error: "status must be approved or rejected" }); return;
    }

    const [sub] = await db.select().from(challengeSubmissionsTable).where(eq(challengeSubmissionsTable.id, id)).limit(1);
    if (!sub || sub.userId !== user.id) { res.status(404).json({ error: "Not found" }); return; }

    const [updated] = await db.update(challengeSubmissionsTable)
      .set({ status, reviewNote, reviewedAt: new Date() })
      .where(eq(challengeSubmissionsTable.id, id))
      .returning();

    // Award points on approval
    if (status === "approved") {
      const [challenge] = await db.select().from(fanChallengesTable).where(eq(fanChallengesTable.id, sub.challengeId)).limit(1);
      if (challenge) {
        await db.update(fanProfilesTable)
          .set({ totalPoints: sql`${fanProfilesTable.totalPoints} + ${challenge.pointValue}` })
          .where(eq(fanProfilesTable.id, sub.fanProfileId));
        await db.insert(fanPointsLedgerTable).values({
          fanProfileId: sub.fanProfileId,
          userId: user.id,
          action: "challenge_completed",
          points: challenge.pointValue,
          description: `Challenge approved: ${challenge.title}`,
        });
        // Recompute tier
        const [fan] = await db.select().from(fanProfilesTable).where(eq(fanProfilesTable.id, sub.fanProfileId)).limit(1);
        if (fan) {
          const newTier = computeFanTier(fan);
          if (newTier > fan.fanTier) {
            await db.update(fanProfilesTable).set({ fanTier: newTier }).where(eq(fanProfilesTable.id, fan.id));
            await db.insert(fanTierHistoryTable).values({
              fanProfileId: fan.id,
              userId: user.id,
              fromTier: fan.fanTier,
              toTier: newTier,
              reason: "Challenge completion triggered tier upgrade",
            });
          }
        }
      }
    }

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: "Failed to review submission" });
  }
});

// ── Content Vault ─────────────────────────────────────────────────────────────

router.get("/fan-hub/vault", requireAuth, requireTier("agency"), async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    let rows = await db.select().from(contentVaultItemsTable)
      .where(eq(contentVaultItemsTable.userId, user.id))
      .orderBy(asc(contentVaultItemsTable.accessTier), desc(contentVaultItemsTable.createdAt));

    if (rows.length === 0 && process.env.NODE_ENV !== "production") {
      const fans = await db.select().from(fanProfilesTable).where(eq(fanProfilesTable.userId, user.id)).limit(1);
      if (fans.length === 0) await seedFanHubData(user.id);
      rows = await db.select().from(contentVaultItemsTable)
        .where(eq(contentVaultItemsTable.userId, user.id))
        .orderBy(asc(contentVaultItemsTable.accessTier), desc(contentVaultItemsTable.createdAt));
    }

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to list vault items" });
  }
});

router.post("/fan-hub/vault", requireAuth, requireTier("agency"), async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    const { title, description, contentType, accessTier, contentUrl, thumbnailUrl, fileSize, active } = req.body;
    if (!title || !contentType || accessTier === undefined) {
      res.status(400).json({ error: "title, contentType, and accessTier are required" }); return;
    }

    const [item] = await db.insert(contentVaultItemsTable).values({
      userId: user.id,
      title,
      description,
      contentType,
      accessTier: Number(accessTier),
      contentUrl,
      thumbnailUrl,
      fileSize,
      active: active !== false,
    }).returning();

    res.status(201).json(item);
  } catch (err) {
    res.status(500).json({ error: "Failed to create vault item" });
  }
});

router.patch("/fan-hub/vault/:id", requireAuth, requireTier("agency"), async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    const id = Number(req.params.id);
    const { title, description, contentType, accessTier, contentUrl, thumbnailUrl, fileSize, active } = req.body;
    const [updated] = await db.update(contentVaultItemsTable)
      .set({ title, description, contentType, accessTier, contentUrl, thumbnailUrl, fileSize, active })
      .where(and(eq(contentVaultItemsTable.id, id), eq(contentVaultItemsTable.userId, user.id)))
      .returning();
    if (!updated) { res.status(404).json({ error: "Not found" }); return; }
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: "Failed to update vault item" });
  }
});

router.delete("/fan-hub/vault/:id", requireAuth, requireTier("agency"), async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    await db.delete(contentVaultItemsTable)
      .where(and(eq(contentVaultItemsTable.id, Number(req.params.id)), eq(contentVaultItemsTable.userId, user.id)));
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: "Failed to delete vault item" });
  }
});

// ── Merch Codes ───────────────────────────────────────────────────────────────

router.get("/fan-hub/merch-codes", requireAuth, requireTier("agency"), async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    const rows = await db.select({
      id: merchDiscountCodesTable.id,
      userId: merchDiscountCodesTable.userId,
      fanProfileId: merchDiscountCodesTable.fanProfileId,
      code: merchDiscountCodesTable.code,
      discountPercent: merchDiscountCodesTable.discountPercent,
      used: merchDiscountCodesTable.used,
      usedAt: merchDiscountCodesTable.usedAt,
      expiresAt: merchDiscountCodesTable.expiresAt,
      createdAt: merchDiscountCodesTable.createdAt,
      fanDisplayName: fanProfilesTable.displayName,
    })
      .from(merchDiscountCodesTable)
      .leftJoin(fanProfilesTable, eq(merchDiscountCodesTable.fanProfileId, fanProfilesTable.id))
      .where(eq(merchDiscountCodesTable.userId, user.id))
      .orderBy(desc(merchDiscountCodesTable.createdAt));

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to list merch codes" });
  }
});

router.post("/fan-hub/merch-codes/generate", requireAuth, requireTier("agency"), async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    const { fanProfileId, discountPercent, expiresAt } = req.body;
    if (!fanProfileId) { res.status(400).json({ error: "fanProfileId is required" }); return; }

    const [fan] = await db.select().from(fanProfilesTable)
      .where(and(eq(fanProfilesTable.id, Number(fanProfileId)), eq(fanProfilesTable.userId, user.id)))
      .limit(1);
    if (!fan) { res.status(404).json({ error: "Fan not found" }); return; }
    if (fan.fanTier < 3) { res.status(400).json({ error: "Fan must be Tier 3 or higher to receive merch codes" }); return; }

    const code = `AREAFADA-${nanoid(6)}`;
    const [created] = await db.insert(merchDiscountCodesTable).values({
      userId: user.id,
      fanProfileId: Number(fanProfileId),
      code,
      discountPercent: discountPercent ?? 15,
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
    }).returning();

    res.status(201).json({ ...created, fanDisplayName: fan.displayName });
  } catch (err) {
    res.status(500).json({ error: "Failed to generate merch code" });
  }
});

// ── OG Invite List ────────────────────────────────────────────────────────────

router.get("/fan-hub/og-list", requireAuth, requireTier("agency"), async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    const rows = await db.select({
      id: ogInviteListTable.id,
      userId: ogInviteListTable.userId,
      fanProfileId: ogInviteListTable.fanProfileId,
      status: ogInviteListTable.status,
      inviteLink: ogInviteListTable.inviteLink,
      invitedAt: ogInviteListTable.invitedAt,
      lastActiveAt: ogInviteListTable.lastActiveAt,
      notes: ogInviteListTable.notes,
      createdAt: ogInviteListTable.createdAt,
      fanDisplayName: fanProfilesTable.displayName,
      fanTier: fanProfilesTable.fanTier,
      totalPoints: fanProfilesTable.totalPoints,
    })
      .from(ogInviteListTable)
      .leftJoin(fanProfilesTable, eq(ogInviteListTable.fanProfileId, fanProfilesTable.id))
      .where(eq(ogInviteListTable.userId, user.id))
      .orderBy(desc(fanProfilesTable.totalPoints));

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to list OG invite list" });
  }
});

router.post("/fan-hub/og-list/invite", requireAuth, requireTier("agency"), async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    const { fanProfileId, notes } = req.body;
    if (!fanProfileId) { res.status(400).json({ error: "fanProfileId is required" }); return; }

    const [fan] = await db.select().from(fanProfilesTable)
      .where(and(eq(fanProfilesTable.id, Number(fanProfileId)), eq(fanProfilesTable.userId, user.id)))
      .limit(1);
    if (!fan) { res.status(404).json({ error: "Fan not found" }); return; }

    const inviteLink = `https://chat.whatsapp.com/areafadaog-${nanoid(12).toLowerCase()}`;
    const [invite] = await db.insert(ogInviteListTable).values({
      userId: user.id,
      fanProfileId: Number(fanProfileId),
      status: "invited",
      inviteLink,
      invitedAt: new Date(),
      notes,
    }).returning();

    res.status(201).json({ ...invite, fanDisplayName: fan.displayName, fanTier: fan.fanTier, totalPoints: fan.totalPoints });
  } catch (err) {
    res.status(500).json({ error: "Failed to create OG invite" });
  }
});

router.patch("/fan-hub/og-list/:id", requireAuth, requireTier("agency"), async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    const id = Number(req.params.id);
    const { status, notes, lastActiveAt } = req.body;
    const [updated] = await db.update(ogInviteListTable)
      .set({ status, notes, lastActiveAt: lastActiveAt ? new Date(lastActiveAt) : undefined })
      .where(and(eq(ogInviteListTable.id, id), eq(ogInviteListTable.userId, user.id)))
      .returning();
    if (!updated) { res.status(404).json({ error: "Not found" }); return; }
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: "Failed to update OG invite" });
  }
});

// ── Fan Analytics ─────────────────────────────────────────────────────────────

router.get("/fan-hub/analytics", requireAuth, requireTier("agency"), async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    const fans = await db.select().from(fanProfilesTable).where(eq(fanProfilesTable.userId, user.id));
    const challenges = await db.select().from(fanChallengesTable).where(eq(fanChallengesTable.userId, user.id));
    const vaultItems = await db.select().from(contentVaultItemsTable).where(eq(contentVaultItemsTable.userId, user.id));

    const totalFans = fans.length;
    const fansByTier: Record<string, number> = { "1": 0, "2": 0, "3": 0, "4": 0 };
    for (const f of fans) fansByTier[String(f.fanTier)] = (fansByTier[String(f.fanTier)] ?? 0) + 1;

    // Weekly signups — last 6 weeks
    const now = new Date();
    const weeklySignups: { week: string; count: number }[] = [];
    for (let w = 5; w >= 0; w--) {
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - w * 7 - now.getDay());
      weekStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 7);
      const count = fans.filter(f => new Date(f.joinedAt) >= weekStart && new Date(f.joinedAt) < weekEnd).length;
      weeklySignups.push({ week: weekStart.toISOString().slice(0, 10), count });
    }

    const topChallenges = [...challenges]
      .sort((a, b) => b.participantCount - a.participantCount)
      .slice(0, 5)
      .map(c => ({ id: c.id, title: c.title, participantCount: c.participantCount }));

    const popularVaultItems = [...vaultItems]
      .sort((a, b) => b.downloadCount - a.downloadCount)
      .slice(0, 5)
      .map(v => ({ id: v.id, title: v.title, downloadCount: v.downloadCount }));

    const verifiedFans = fans.filter(f => f.purchaseVerified).length;
    const referralConversionRate = totalFans > 0 ? `${((verifiedFans / totalFans) * 100).toFixed(1)}%` : "0%";

    res.json({ totalFans, fansByTier, weeklySignups, topChallenges, popularVaultItems, referralConversionRate });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch fan analytics" });
  }
});

export default router;
