import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { usersTable, platformOauthConfigsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { encryptToken, decryptToken } from "../lib/tokenEncryption.js";

const router = Router();

const PLATFORMS = ["instagram", "facebook", "x", "tiktok"] as const;
type OAuthPlatform = typeof PLATFORMS[number];

const requireAuth = (req: any, res: any, next: any) => {
  const auth = getAuth(req);
  const rawId = auth?.sessionClaims?.userId || auth?.userId;
  const userId = typeof rawId === "string" ? rawId : null;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  req.clerkUserId = userId;
  next();
};

async function getDbUser(clerkId: string) {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  return user ?? null;
}

const PLATFORM_LABELS: Record<OAuthPlatform, { appIdLabel: string; appSecretLabel: string }> = {
  instagram: { appIdLabel: "App ID", appSecretLabel: "App Secret" },
  facebook: { appIdLabel: "App ID", appSecretLabel: "App Secret" },
  x: { appIdLabel: "Client ID", appSecretLabel: "Client Secret" },
  tiktok: { appIdLabel: "Client Key", appSecretLabel: "Client Secret" },
};

// GET /settings/credentials — return credential status per platform (secrets masked)
router.get("/settings/credentials", requireAuth, async (req: any, res): Promise<void> => {
  const user = await getDbUser(req.clerkUserId);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const rows = await db.select()
    .from(platformOauthConfigsTable)
    .where(eq(platformOauthConfigsTable.userId, user.id));

  const result: Record<string, { appId: string | null; hasSecret: boolean }> = {};
  for (const platform of PLATFORMS) {
    const row = rows.find((r) => r.platform === platform);
    result[platform] = {
      appId: row?.appId ?? null,
      hasSecret: !!row?.appSecret,
    };
  }

  res.json({ credentials: result });
});

// PUT /settings/credentials — upsert credentials for a single platform
router.put("/settings/credentials/:platform", requireAuth, async (req: any, res): Promise<void> => {
  const { platform } = req.params;
  if (!PLATFORMS.includes(platform as OAuthPlatform)) {
    res.status(400).json({ error: `Unsupported platform: ${platform}` });
    return;
  }

  const user = await getDbUser(req.clerkUserId);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { appId, appSecret } = req.body as { appId?: string; appSecret?: string };

  const [existing] = await db.select({ id: platformOauthConfigsTable.id, appSecret: platformOauthConfigsTable.appSecret })
    .from(platformOauthConfigsTable)
    .where(and(
      eq(platformOauthConfigsTable.userId, user.id),
      eq(platformOauthConfigsTable.platform, platform),
    ));

  const encryptedSecret = appSecret ? encryptToken(appSecret) : existing?.appSecret ?? null;

  if (existing) {
    await db.update(platformOauthConfigsTable)
      .set({
        appId: appId !== undefined ? (appId || null) : undefined,
        appSecret: encryptedSecret,
        updatedAt: new Date(),
      })
      .where(eq(platformOauthConfigsTable.id, existing.id));
  } else {
    await db.insert(platformOauthConfigsTable).values({
      userId: user.id,
      platform,
      appId: appId || null,
      appSecret: encryptedSecret,
    });
  }

  res.json({ ok: true, platform });
});

// DELETE /settings/credentials/:platform — clear saved credentials
router.delete("/settings/credentials/:platform", requireAuth, async (req: any, res): Promise<void> => {
  const { platform } = req.params;
  const user = await getDbUser(req.clerkUserId);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  await db.update(platformOauthConfigsTable)
    .set({ appId: null, appSecret: null, updatedAt: new Date() })
    .where(and(
      eq(platformOauthConfigsTable.userId, user.id),
      eq(platformOauthConfigsTable.platform, platform),
    ));

  res.json({ ok: true });
});

// ─── Live API Keys (YouTube Data API / Instagram Graph API) ─────────────────
// Stored in platformOauthConfigsTable with special platform names so they
// share the same encrypted-at-rest pattern as OAuth credentials.

const LIVE_API_PLATFORMS = {
  youtube: "youtube_live_api",
  instagram: "instagram_live_api",
} as const;

// GET /settings/live-api-keys — returns presence only (values never sent to client)
router.get("/settings/live-api-keys", requireAuth, async (req: any, res): Promise<void> => {
  const user = await getDbUser(req.clerkUserId);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const rows = await db.select()
    .from(platformOauthConfigsTable)
    .where(
      eq(platformOauthConfigsTable.userId, user.id)
    );

  const ytRow = rows.find(r => r.platform === LIVE_API_PLATFORMS.youtube);
  const igRow = rows.find(r => r.platform === LIVE_API_PLATFORMS.instagram);

  res.json({
    youtube: { configured: !!(ytRow?.appId), envOverride: !!process.env.YOUTUBE_API_KEY },
    instagram: { configured: !!(igRow?.appSecret), envOverride: !!process.env.INSTAGRAM_ACCESS_TOKEN },
  });
});

// PUT /settings/live-api-keys — upsert one or both keys
router.put("/settings/live-api-keys", requireAuth, async (req: any, res): Promise<void> => {
  const user = await getDbUser(req.clerkUserId);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { youtubeApiKey, instagramAccessToken } = req.body as { youtubeApiKey?: string; instagramAccessToken?: string };

  if (youtubeApiKey !== undefined) {
    const [existing] = await db.select({ id: platformOauthConfigsTable.id })
      .from(platformOauthConfigsTable)
      .where(and(eq(platformOauthConfigsTable.userId, user.id), eq(platformOauthConfigsTable.platform, LIVE_API_PLATFORMS.youtube)));

    if (existing) {
      await db.update(platformOauthConfigsTable)
        .set({ appId: youtubeApiKey || null, updatedAt: new Date() })
        .where(eq(platformOauthConfigsTable.id, existing.id));
    } else {
      await db.insert(platformOauthConfigsTable).values({
        userId: user.id, platform: LIVE_API_PLATFORMS.youtube, appId: youtubeApiKey || null,
      });
    }
  }

  if (instagramAccessToken !== undefined) {
    const encrypted = instagramAccessToken ? encryptToken(instagramAccessToken) : null;
    const [existing] = await db.select({ id: platformOauthConfigsTable.id })
      .from(platformOauthConfigsTable)
      .where(and(eq(platformOauthConfigsTable.userId, user.id), eq(platformOauthConfigsTable.platform, LIVE_API_PLATFORMS.instagram)));

    if (existing) {
      await db.update(platformOauthConfigsTable)
        .set({ appSecret: encrypted, updatedAt: new Date() })
        .where(eq(platformOauthConfigsTable.id, existing.id));
    } else {
      await db.insert(platformOauthConfigsTable).values({
        userId: user.id, platform: LIVE_API_PLATFORMS.instagram, appSecret: encrypted,
      });
    }
  }

  res.json({ ok: true });
});

// DELETE /settings/live-api-keys/:key — clear youtube or instagram key
router.delete("/settings/live-api-keys/:key", requireAuth, async (req: any, res): Promise<void> => {
  const user = await getDbUser(req.clerkUserId);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { key } = req.params;
  if (key === "youtube") {
    await db.update(platformOauthConfigsTable)
      .set({ appId: null, updatedAt: new Date() })
      .where(and(eq(platformOauthConfigsTable.userId, user.id), eq(platformOauthConfigsTable.platform, LIVE_API_PLATFORMS.youtube)));
  } else if (key === "instagram") {
    await db.update(platformOauthConfigsTable)
      .set({ appSecret: null, updatedAt: new Date() })
      .where(and(eq(platformOauthConfigsTable.userId, user.id), eq(platformOauthConfigsTable.platform, LIVE_API_PLATFORMS.instagram)));
  } else {
    res.status(400).json({ error: "key must be youtube or instagram" }); return;
  }

  res.json({ ok: true });
});

export { getDbUserCredentials, getDbUserLiveApiKeys };

async function getDbUserLiveApiKeys(userId: number): Promise<{ youtubeApiKey: string | null; instagramAccessToken: string | null }> {
  const rows = await db.select()
    .from(platformOauthConfigsTable)
    .where(eq(platformOauthConfigsTable.userId, userId));

  const ytRow = rows.find(r => r.platform === LIVE_API_PLATFORMS.youtube);
  const igRow = rows.find(r => r.platform === LIVE_API_PLATFORMS.instagram);

  return {
    youtubeApiKey: ytRow?.appId ?? null,
    instagramAccessToken: igRow?.appSecret ? decryptToken(igRow.appSecret) : null,
  };
}

async function getDbUserCredentials(userId: number, platform: string): Promise<{ appId: string | null; appSecret: string | null }> {
  const [row] = await db.select()
    .from(platformOauthConfigsTable)
    .where(and(
      eq(platformOauthConfigsTable.userId, userId),
      eq(platformOauthConfigsTable.platform, platform),
    ));

  if (!row) return { appId: null, appSecret: null };

  return {
    appId: row.appId ?? null,
    appSecret: row.appSecret ? decryptToken(row.appSecret) : null,
  };
}

export default router;
