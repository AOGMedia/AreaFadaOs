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
  restream: "restream_live_api",
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
  const rstRow = rows.find(r => r.platform === LIVE_API_PLATFORMS.restream);

  // Restream: parse verification metadata stored in the otherwise-unused appId column
  let restreamLastVerified: string | null = null;
  let restreamKeyExpired: boolean | null = null;
  if (rstRow?.appId) {
    try {
      const meta = JSON.parse(rstRow.appId) as { lastVerified?: string; expired?: boolean };
      restreamLastVerified = meta.lastVerified ?? null;
      restreamKeyExpired = meta.expired ?? null;
    } catch {
      // ignore malformed metadata
    }
  }

  res.json({
    youtube: { configured: !!(ytRow?.appId), envOverride: !!process.env.YOUTUBE_API_KEY },
    instagram: { configured: !!(igRow?.appSecret), envOverride: !!process.env.INSTAGRAM_ACCESS_TOKEN },
    restream: {
      configured: !!(rstRow?.appSecret) || !!process.env.RESTREAM_API_KEY,
      envOverride: !!process.env.RESTREAM_API_KEY,
      lastVerified: restreamLastVerified,
      keyExpired: restreamKeyExpired,
    },
  });
});

// PUT /settings/live-api-keys — upsert one or both keys
router.put("/settings/live-api-keys", requireAuth, async (req: any, res): Promise<void> => {
  const user = await getDbUser(req.clerkUserId);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { youtubeApiKey, instagramAccessToken, restreamApiKey } = req.body as { youtubeApiKey?: string; instagramAccessToken?: string; restreamApiKey?: string };

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

  if (restreamApiKey !== undefined) {
    const encrypted = restreamApiKey ? encryptToken(restreamApiKey) : null;
    const [existing] = await db.select({ id: platformOauthConfigsTable.id })
      .from(platformOauthConfigsTable)
      .where(and(eq(platformOauthConfigsTable.userId, user.id), eq(platformOauthConfigsTable.platform, LIVE_API_PLATFORMS.restream)));

    if (existing) {
      await db.update(platformOauthConfigsTable)
        // Reset verification metadata whenever a new key is saved
        .set({ appSecret: encrypted, appId: null, updatedAt: new Date() })
        .where(eq(platformOauthConfigsTable.id, existing.id));
    } else {
      await db.insert(platformOauthConfigsTable).values({
        userId: user.id, platform: LIVE_API_PLATFORMS.restream, appSecret: encrypted,
      });
    }
  }

  res.json({ ok: true });
});

// POST /settings/live-api-keys/check-restream — silently verify the stored key and persist result
router.post("/settings/live-api-keys/check-restream", requireAuth, async (req: any, res): Promise<void> => {
  const user = await getDbUser(req.clerkUserId);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  // Resolve which key to verify (env override takes precedence)
  let apiKey: string | null = null;
  let useEnvKey = false;
  if (process.env.RESTREAM_API_KEY) {
    apiKey = process.env.RESTREAM_API_KEY;
    useEnvKey = true;
  } else {
    const rows = await db.select()
      .from(platformOauthConfigsTable)
      .where(and(
        eq(platformOauthConfigsTable.userId, user.id),
        eq(platformOauthConfigsTable.platform, LIVE_API_PLATFORMS.restream),
      ));
    const rstRow = rows[0];
    apiKey = rstRow?.appSecret ? decryptToken(rstRow.appSecret) : null;
  }

  if (!apiKey) {
    res.status(422).json({ ok: false, error: "No Restream API key configured." });
    return;
  }

  let expired = false;
  let verifyError: string | null = null;

  try {
    const response = await fetch("https://api.restream.io/v2/user/profile", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(8000),
    });
    if (response.status === 401 || response.status === 403) {
      expired = true;
    } else if (!response.ok) {
      verifyError = `Restream returned ${response.status}`;
    }
  } catch (err: any) {
    verifyError = err?.name === "TimeoutError" ? "Request timed out" : (err?.message ?? "Network error");
  }

  const lastVerified = new Date().toISOString();
  const meta = JSON.stringify({ lastVerified, expired });

  // Persist verification result in the DB row (only when using the stored key, not env override)
  if (!useEnvKey) {
    const [existing] = await db.select({ id: platformOauthConfigsTable.id })
      .from(platformOauthConfigsTable)
      .where(and(
        eq(platformOauthConfigsTable.userId, user.id),
        eq(platformOauthConfigsTable.platform, LIVE_API_PLATFORMS.restream),
      ));
    if (existing) {
      await db.update(platformOauthConfigsTable)
        .set({ appId: meta, updatedAt: new Date() })
        .where(eq(platformOauthConfigsTable.id, existing.id));
    }
  }

  res.json({ ok: !expired && !verifyError, expired, lastVerified, error: verifyError });
});

// POST /settings/live-api-keys/test-restream — validate key against Restream API
router.post("/settings/live-api-keys/test-restream", requireAuth, async (req: any, res): Promise<void> => {
  const user = await getDbUser(req.clerkUserId);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  // Accept an unsaved key from the body (the user may be testing before saving),
  // otherwise fall back to the stored or env key.
  let apiKey: string | null = (req.body as { apiKey?: string }).apiKey?.trim() || null;

  if (!apiKey) {
    // Try env override first, then DB
    if (process.env.RESTREAM_API_KEY) {
      apiKey = process.env.RESTREAM_API_KEY;
    } else {
      const rows = await db.select()
        .from(platformOauthConfigsTable)
        .where(and(
          eq(platformOauthConfigsTable.userId, user.id),
          eq(platformOauthConfigsTable.platform, LIVE_API_PLATFORMS.restream),
        ));
      const rstRow = rows[0];
      apiKey = rstRow?.appSecret ? decryptToken(rstRow.appSecret) : null;
    }
  }

  if (!apiKey) {
    res.status(422).json({ ok: false, error: "No Restream API key configured. Save or paste a key first." });
    return;
  }

  try {
    const response = await fetch("https://api.restream.io/v2/channel", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (response.status === 401 || response.status === 403) {
      res.json({ ok: false, invalid: true, channels: [] });
      return;
    }

    if (!response.ok) {
      const text = await response.text().catch(() => response.statusText);
      res.json({ ok: false, error: `Restream returned ${response.status}: ${text}`, channels: [] });
      return;
    }

    const data = await response.json() as unknown;
    // Restream /v2/channel returns an array of channel objects
    const raw = Array.isArray(data) ? data : ((data as any)?.items ?? []);
    const channels = raw.map((ch: any) => ({
      id: ch.id ?? ch.channelId,
      displayName: ch.displayName ?? ch.name ?? ch.platform ?? "Unknown",
      platform: ch.type ?? ch.platform ?? "unknown",
      active: ch.active ?? ch.enabled ?? ch.status === "active" ?? false,
    }));

    res.json({ ok: true, channels });
  } catch (err: any) {
    if (err?.name === "TimeoutError" || err?.code === "ABORT_ERR") {
      res.status(504).json({ ok: false, error: "Request to Restream timed out. Check your network or try again." });
    } else {
      res.status(502).json({ ok: false, error: err?.message ?? "Failed to reach Restream API." });
    }
  }
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
  } else if (key === "restream") {
    await db.update(platformOauthConfigsTable)
      .set({ appSecret: null, updatedAt: new Date() })
      .where(and(eq(platformOauthConfigsTable.userId, user.id), eq(platformOauthConfigsTable.platform, LIVE_API_PLATFORMS.restream)));
  } else {
    res.status(400).json({ error: "key must be youtube, instagram, or restream" }); return;
  }

  res.json({ ok: true });
});

export { getDbUserCredentials, getDbUserLiveApiKeys };

async function getDbUserLiveApiKeys(userId: number): Promise<{ youtubeApiKey: string | null; instagramAccessToken: string | null; restreamApiKey: string | null }> {
  const rows = await db.select()
    .from(platformOauthConfigsTable)
    .where(eq(platformOauthConfigsTable.userId, userId));

  const ytRow = rows.find(r => r.platform === LIVE_API_PLATFORMS.youtube);
  const igRow = rows.find(r => r.platform === LIVE_API_PLATFORMS.instagram);
  const rstRow = rows.find(r => r.platform === LIVE_API_PLATFORMS.restream);

  return {
    youtubeApiKey: ytRow?.appId ?? null,
    instagramAccessToken: igRow?.appSecret ? decryptToken(igRow.appSecret) : null,
    restreamApiKey: rstRow?.appSecret ? decryptToken(rstRow.appSecret) : null,
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
