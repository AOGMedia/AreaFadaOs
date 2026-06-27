import { Router } from "express";
import { requireAuth } from "./users";
import { requireTier } from "../middlewares/tierGuard";
import { db } from "@workspace/db";
import {
  postsTable,
  campaignsTable,
  platformAccountsTable,
  hashtagCacheTable,
  usersTable,
} from "@workspace/db";
import { eq, and, desc, gte, lte, inArray } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";

const router = Router();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const TONE_PROMPTS: Record<string, string> = {
  pidgin: `You are Charly Boy (Area Fada), Nigeria's most iconic provocateur and cultural rebel. Write in Nigerian Pidgin English — vibrant, street-smart, full of energy and African swagger. Use pidgin phrases like "e don do", "wahala dey", "na today?", "shine your eye". Keep it real, keep it Lagos.`,
  yoruba: `You are Charly Boy, a Yoruba cultural icon. Sprinkle Yoruba expressions into the caption — phrases like "Àṣà wa", "Ẹní bá mọ ara ẹni", "E kaaro", proverbs where fitting. Blend Yoruba wisdom with contemporary social media voice. Dignified yet relatable.`,
  igbo: `You are Charly Boy, rooted in Igbo heritage. Incorporate Igbo expressions — phrases like "Onye wetara oji", "Igbo amaka", "Ndi be m". Blend Igbo pride and community spirit with a bold social media presence. Authentic and powerful.`,
  hausa: `You are Charly Boy, speaking to Northern Nigeria. Incorporate Hausa expressions — phrases like "Kai!", "Wallahi", "Sai anjima", "Toh". Respectful, community-focused yet bold. Bridge Northern and Southern Nigeria through the caption.`,
  formal: `You are Charly Boy's brand voice for corporate and international audiences. Write in polished, professional English suitable for brands, press, and global audiences. Authoritative, inspirational, clear. No slang — pure impact.`,
};

const PLATFORM_CONSTRAINTS: Record<string, { maxChars: number; style: string }> = {
  instagram: { maxChars: 2200, style: "storytelling with line breaks, 3-5 hashtags at end" },
  tiktok: { maxChars: 300, style: "punchy hook in first line, trending energy, 2-3 hashtags inline" },
  x: { maxChars: 280, style: "sharp and opinionated, one strong statement, 1-2 hashtags max" },
  youtube: { maxChars: 1000, style: "SEO-friendly description, clear value proposition, call to action" },
  facebook: { maxChars: 500, style: "conversational, community-driven, question or call to action" },
  threads: { maxChars: 500, style: "casual conversational, thought-provoking, no hashtags" },
};

async function getOrCreateUser(clerkId: string) {
  const existing = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId)).limit(1);
  if (existing.length > 0) return existing[0];
  const [created] = await db.insert(usersTable).values({
    clerkId,
    email: `${clerkId}@areafadaos.app`,
    displayName: "Area Fada",
    tier: "creator",
  }).returning();
  return created;
}

function seedPlatformAccounts(userId: number) {
  const accounts = [
    { userId, platform: "instagram" as const, handle: "@charlyboyland", displayName: "Charly Boy", connected: false, followerCount: 245000 },
    { userId, platform: "tiktok" as const, handle: "@charlyboyland", displayName: "Charly Boy", connected: false, followerCount: 89000 },
    { userId, platform: "x" as const, handle: "@AreaFada1", displayName: "Charly Boy (Area Fada)", connected: false, followerCount: 312000 },
    { userId, platform: "youtube" as const, handle: "Charly Boy Africa", displayName: "Charly Boy Africa", connected: false, followerCount: 67000 },
    { userId, platform: "facebook" as const, handle: "CharlyBoyAfrica", displayName: "Charly Boy", connected: false, followerCount: 528000 },
    { userId, platform: "threads" as const, handle: "@charlyboyland", displayName: "Charly Boy", connected: false, followerCount: 12000 },
  ];
  return db.insert(platformAccountsTable).values(accounts).onConflictDoNothing();
}

function seedHashtags() {
  const tags: typeof hashtagCacheTable.$inferInsert[] = [
    { platform: "instagram", hashtag: "#NigeriaTwitter", region: "NG", trendScore: 98, category: "general" },
    { platform: "instagram", hashtag: "#NaijaTwitter", region: "NG", trendScore: 95, category: "general" },
    { platform: "instagram", hashtag: "#999Book", region: "NG", trendScore: 92, category: "book" },
    { platform: "instagram", hashtag: "#CharlyBoy", region: "NG", trendScore: 88, category: "brand" },
    { platform: "instagram", hashtag: "#AreaFada", region: "NG", trendScore: 85, category: "brand" },
    { platform: "instagram", hashtag: "#LagosLife", region: "NG", trendScore: 82, category: "lifestyle" },
    { platform: "instagram", hashtag: "#AfricaRising", region: "NG", trendScore: 80, category: "general" },
    { platform: "instagram", hashtag: "#NaijaCreators", region: "NG", trendScore: 78, category: "creator" },
    { platform: "tiktok", hashtag: "#NaijaTikTok", region: "NG", trendScore: 99, category: "general" },
    { platform: "tiktok", hashtag: "#AfricaTikTok", region: "NG", trendScore: 94, category: "general" },
    { platform: "tiktok", hashtag: "#PidginTikTok", region: "NG", trendScore: 90, category: "culture" },
    { platform: "tiktok", hashtag: "#NigeriaVibes", region: "NG", trendScore: 87, category: "lifestyle" },
    { platform: "x", hashtag: "#Nigeria", region: "NG", trendScore: 97, category: "general" },
    { platform: "x", hashtag: "#Naija", region: "NG", trendScore: 93, category: "general" },
    { platform: "x", hashtag: "#LekkiTollGate", region: "NG", trendScore: 89, category: "activism" },
    { platform: "x", hashtag: "#EndSARS", region: "NG", trendScore: 75, category: "activism" },
    { platform: "instagram", hashtag: "#GhanaIsGood", region: "GH", trendScore: 88, category: "general" },
    { platform: "instagram", hashtag: "#AccraLife", region: "GH", trendScore: 84, category: "lifestyle" },
    { platform: "instagram", hashtag: "#NairobiNow", region: "KE", trendScore: 86, category: "general" },
    { platform: "instagram", hashtag: "#KenyaCreators", region: "KE", trendScore: 81, category: "creator" },
    { platform: "youtube", hashtag: "#NigeriaYouTube", region: "NG", trendScore: 85, category: "creator" },
    { platform: "facebook", hashtag: "#NigeriaFacebook", region: "NG", trendScore: 76, category: "general" },
    { platform: "threads", hashtag: "#AfricanThreads", region: "NG", trendScore: 72, category: "general" },
  ];
  return db.insert(hashtagCacheTable).values(tags).onConflictDoNothing();
}

// ─── POSTS ────────────────────────────────────────────────────────────────────

router.get("/posts", requireAuth, requireTier("creator"), async (req: any, res): Promise<void> => {
  try {
    const user = await getOrCreateUser(req.clerkUserId);
    const { status, campaignId, platform, from, to } = req.query;

    let query = db.select().from(postsTable).where(eq(postsTable.userId, user.id)).$dynamic();

    const conditions = [eq(postsTable.userId, user.id)];
    if (status) conditions.push(eq(postsTable.status, status as "draft" | "scheduled" | "published" | "failed"));
    if (campaignId) conditions.push(eq(postsTable.campaignId, parseInt(campaignId as string)));
    if (from) conditions.push(gte(postsTable.scheduledAt, new Date(from as string)));
    if (to) conditions.push(lte(postsTable.scheduledAt, new Date(to as string)));

    const posts = await db.select().from(postsTable)
      .where(and(...conditions))
      .orderBy(desc(postsTable.createdAt))
      .limit(100);

    const filtered = platform
      ? posts.filter((p) => (p.platforms as string[]).includes(platform as string))
      : posts;

    res.json(filtered);
  } catch (err) {
    res.status(500).json({ error: "Failed to list posts" });
  }
});

router.post("/posts", requireAuth, requireTier("creator"), async (req: any, res): Promise<void> => {
  try {
    const user = await getOrCreateUser(req.clerkUserId);
    const { caption, platforms, campaignId, scheduledAt, tone, hashtags, mediaUrls, platformVariants } = req.body;

    const status = scheduledAt ? "scheduled" : "draft";
    const [post] = await db.insert(postsTable).values({
      userId: user.id,
      caption,
      platforms: platforms || [],
      campaignId: campaignId || null,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      status,
      tone: tone || null,
      hashtags: hashtags || [],
      mediaUrls: mediaUrls || [],
      platformVariants: platformVariants || {},
    }).returning();

    res.status(201).json(post);
  } catch (err) {
    res.status(500).json({ error: "Failed to create post" });
  }
});

router.get("/posts/hashtags", requireAuth, requireTier("creator"), async (req: any, res): Promise<void> => {
  try {
    const { platform, region = "NG" } = req.query;
    await seedHashtags();

    const conditions = [eq(hashtagCacheTable.region, region as string)];
    if (platform) conditions.push(eq(hashtagCacheTable.platform, platform as "instagram" | "tiktok" | "x" | "youtube" | "facebook" | "threads"));

    const tags = await db.select().from(hashtagCacheTable)
      .where(and(...conditions))
      .orderBy(desc(hashtagCacheTable.trendScore))
      .limit(30);

    res.json(tags);
  } catch (err) {
    res.status(500).json({ error: "Failed to get hashtags" });
  }
});

router.post("/posts/captions", requireAuth, requireTier("creator"), async (req: any, res): Promise<void> => {
  try {
    const { topic, tones, platforms, context, hashtags } = req.body;

    const hashtagStr = hashtags?.length ? `\nSuggested hashtags to include: ${hashtags.slice(0, 5).join(", ")}` : "";
    const contextStr = context ? `\nExtra context: ${context}` : "";

    const results = await Promise.all(
      (tones as string[]).map(async (tone) => {
        const systemPrompt = TONE_PROMPTS[tone] || TONE_PROMPTS.formal;
        const variants: Record<string, string> = {};

        await Promise.all(
          (platforms as string[]).map(async (platform) => {
            const constraints = PLATFORM_CONSTRAINTS[platform] || { maxChars: 500, style: "engaging" };
            const userPrompt = `Topic: ${topic}${contextStr}${hashtagStr}

Platform: ${platform.toUpperCase()}
Style: ${constraints.style}
Max characters: ${constraints.maxChars}

Write ONE caption only. No explanation, no label, just the caption text. Make it authentic to the tone.`;

            const msg = await anthropic.messages.create({
              model: "claude-haiku-4-5",
              max_tokens: 500,
              system: systemPrompt,
              messages: [{ role: "user", content: userPrompt }],
            });

            const text = msg.content[0].type === "text" ? msg.content[0].text.trim() : "";
            variants[platform] = text;
          })
        );

        return { tone, variants };
      })
    );

    res.json({ captions: results });
  } catch (err: any) {
    console.error("Caption generation error:", err?.message);
    res.status(500).json({ error: "Failed to generate captions" });
  }
});

router.post("/posts/bulk-upload", requireAuth, requireTier("creator"), async (req: any, res): Promise<void> => {
  try {
    const user = await getOrCreateUser(req.clerkUserId);
    const { posts: rawPosts } = req.body;

    if (!Array.isArray(rawPosts) || rawPosts.length === 0) {
      res.status(400).json({ error: "posts array required" });
      return;
    }

    const toInsert = rawPosts.slice(0, 50).map((p: any) => ({
      userId: user.id,
      caption: p.caption || "",
      platforms: p.platforms || [],
      campaignId: p.campaignId || null,
      scheduledAt: p.scheduledAt ? new Date(p.scheduledAt) : null,
      status: (p.scheduledAt ? "scheduled" : "draft") as "draft" | "scheduled",
      hashtags: p.hashtags || [],
      mediaUrls: [],
      platformVariants: {},
    }));

    let imported = 0;
    let failed = 0;
    const inserted = [];

    for (const item of toInsert) {
      try {
        const [post] = await db.insert(postsTable).values(item).returning();
        inserted.push(post);
        imported++;
      } catch {
        failed++;
      }
    }

    res.json({ imported, failed, posts: inserted });
  } catch (err) {
    res.status(500).json({ error: "Bulk upload failed" });
  }
});

router.get("/posts/:id", requireAuth, requireTier("creator"), async (req: any, res): Promise<void> => {
  try {
    const user = await getOrCreateUser(req.clerkUserId);
    const post = await db.select().from(postsTable)
      .where(and(eq(postsTable.id, parseInt(req.params.id)), eq(postsTable.userId, user.id)))
      .limit(1);
    if (!post.length) { res.status(404).json({ error: "Not found" }); return; }
    res.json(post[0]);
  } catch (err) {
    res.status(500).json({ error: "Failed to get post" });
  }
});

router.patch("/posts/:id", requireAuth, requireTier("creator"), async (req: any, res): Promise<void> => {
  try {
    const user = await getOrCreateUser(req.clerkUserId);
    const { caption, platforms, campaignId, scheduledAt, status, tone, hashtags, mediaUrls, platformVariants } = req.body;

    const [updated] = await db.update(postsTable)
      .set({
        ...(caption !== undefined && { caption }),
        ...(platforms !== undefined && { platforms }),
        ...(campaignId !== undefined && { campaignId }),
        ...(scheduledAt !== undefined && { scheduledAt: scheduledAt ? new Date(scheduledAt) : null }),
        ...(status !== undefined && { status }),
        ...(tone !== undefined && { tone }),
        ...(hashtags !== undefined && { hashtags }),
        ...(mediaUrls !== undefined && { mediaUrls }),
        ...(platformVariants !== undefined && { platformVariants }),
        updatedAt: new Date(),
      })
      .where(and(eq(postsTable.id, parseInt(req.params.id)), eq(postsTable.userId, user.id)))
      .returning();

    if (!updated) { res.status(404).json({ error: "Not found" }); return; }
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: "Failed to update post" });
  }
});

router.delete("/posts/:id", requireAuth, requireTier("creator"), async (req: any, res): Promise<void> => {
  try {
    const user = await getOrCreateUser(req.clerkUserId);
    await db.delete(postsTable)
      .where(and(eq(postsTable.id, parseInt(req.params.id)), eq(postsTable.userId, user.id)));
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: "Failed to delete post" });
  }
});

router.post("/posts/:id/recycle", requireAuth, requireTier("creator"), async (req: any, res): Promise<void> => {
  try {
    const user = await getOrCreateUser(req.clerkUserId);
    const { platforms, scheduledAt, tone, refreshCaption = true } = req.body;

    const original = await db.select().from(postsTable)
      .where(and(eq(postsTable.id, parseInt(req.params.id)), eq(postsTable.userId, user.id)))
      .limit(1);

    if (!original.length) { res.status(404).json({ error: "Original post not found" }); return; }

    let newCaption = original[0].caption;

    if (refreshCaption) {
      const toneKey = (tone || original[0].tone || "formal") as string;
      const systemPrompt = TONE_PROMPTS[toneKey] || TONE_PROMPTS.formal;
      const msg = await anthropic.messages.create({
        model: "claude-haiku-4-5",
        max_tokens: 400,
        system: systemPrompt,
        messages: [{
          role: "user",
          content: `Rewrite this social media post with a fresh angle — same message, different energy. Original: "${original[0].caption}"\n\nReturn only the new caption text, no explanation.`,
        }],
      });
      if (msg.content[0].type === "text") newCaption = msg.content[0].text.trim();
    }

    const [recycled] = await db.insert(postsTable).values({
      userId: user.id,
      caption: newCaption,
      platforms: platforms || original[0].platforms,
      campaignId: original[0].campaignId,
      scheduledAt: new Date(scheduledAt),
      status: "scheduled",
      tone: tone || original[0].tone,
      hashtags: original[0].hashtags as string[],
      mediaUrls: original[0].mediaUrls as string[],
      platformVariants: {},
      isRecycled: true,
      originalPostId: original[0].id,
      version: (original[0].version || 1) + 1,
    }).returning();

    res.status(201).json(recycled);
  } catch (err: any) {
    console.error("Recycle error:", err?.message);
    res.status(500).json({ error: "Failed to recycle post" });
  }
});

// ─── CAMPAIGNS ────────────────────────────────────────────────────────────────

router.get("/campaigns", requireAuth, requireTier("creator"), async (req: any, res): Promise<void> => {
  try {
    const user = await getOrCreateUser(req.clerkUserId);
    const campaigns = await db.select().from(campaignsTable)
      .where(eq(campaignsTable.userId, user.id))
      .orderBy(desc(campaignsTable.createdAt));
    res.json(campaigns);
  } catch (err) {
    res.status(500).json({ error: "Failed to list campaigns" });
  }
});

router.post("/campaigns", requireAuth, requireTier("creator"), async (req: any, res): Promise<void> => {
  try {
    const user = await getOrCreateUser(req.clerkUserId);
    const { name, description, color, startDate, endDate } = req.body;
    const [campaign] = await db.insert(campaignsTable).values({
      userId: user.id,
      name,
      description: description || null,
      color: color || "#2dd172",
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
    }).returning();
    res.status(201).json(campaign);
  } catch (err) {
    res.status(500).json({ error: "Failed to create campaign" });
  }
});

router.patch("/campaigns/:id", requireAuth, requireTier("creator"), async (req: any, res): Promise<void> => {
  try {
    const user = await getOrCreateUser(req.clerkUserId);
    const { name, description, color, startDate, endDate } = req.body;
    const [updated] = await db.update(campaignsTable)
      .set({
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(color !== undefined && { color }),
        ...(startDate !== undefined && { startDate: startDate ? new Date(startDate) : null }),
        ...(endDate !== undefined && { endDate: endDate ? new Date(endDate) : null }),
        updatedAt: new Date(),
      })
      .where(and(eq(campaignsTable.id, parseInt(req.params.id)), eq(campaignsTable.userId, user.id)))
      .returning();
    if (!updated) { res.status(404).json({ error: "Not found" }); return; }
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: "Failed to update campaign" });
  }
});

router.delete("/campaigns/:id", requireAuth, requireTier("creator"), async (req: any, res): Promise<void> => {
  try {
    const user = await getOrCreateUser(req.clerkUserId);
    await db.delete(campaignsTable)
      .where(and(eq(campaignsTable.id, parseInt(req.params.id)), eq(campaignsTable.userId, user.id)));
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: "Failed to delete campaign" });
  }
});

// ─── PLATFORM ACCOUNTS ────────────────────────────────────────────────────────

router.get("/platform-accounts", requireAuth, requireTier("creator"), async (req: any, res): Promise<void> => {
  try {
    const user = await getOrCreateUser(req.clerkUserId);
    const existing = await db.select().from(platformAccountsTable)
      .where(eq(platformAccountsTable.userId, user.id));

    if (existing.length === 0) {
      await seedPlatformAccounts(user.id);
      const seeded = await db.select().from(platformAccountsTable)
        .where(eq(platformAccountsTable.userId, user.id));
      res.json(seeded);
      return;
    }

    res.json(existing);
  } catch (err) {
    res.status(500).json({ error: "Failed to list platform accounts" });
  }
});

export default router;
