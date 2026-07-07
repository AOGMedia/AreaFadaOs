import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { usersTable, platformOauthConfigsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { encryptToken, decryptToken } from "../lib/tokenEncryption.js";
import { logger } from "../lib/logger.js";

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

// GET /settings/health — verify platform_oauth_configs table is accessible
router.get("/settings/health", async (_req, res): Promise<void> => {
  try {
    await db.select({ id: platformOauthConfigsTable.id }).from(platformOauthConfigsTable).limit(1);
    res.json({ ok: true, tables: { platform_oauth_configs: true } });
  } catch (err: any) {
    logger.error({ err }, "Health check: platform_oauth_configs table missing or inaccessible");
    res.status(503).json({
      ok: false,
      tables: { platform_oauth_configs: false },
      message: "Database table 'platform_oauth_configs' is not accessible. Run migrations and restart the server.",
      error: err.message,
    });
  }
});

// GET /settings/credentials — return credential status per platform (secrets masked)
router.get("/settings/credentials", requireAuth, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) {
      res.status(401).json({ error: "Unauthorized", message: "Session expired — please reload the page." });
      return;
    }

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
  } catch (err: any) {
    logger.error({ err }, "Failed to load platform credentials");
    if (err.code === "42P01") {
      res.status(503).json({
        error: "Database table missing",
        message: "Credentials table is not set up. Please contact support.",
      });
      return;
    }
    res.status(500).json({
      error: "Database error",
      message: "Could not load credentials. Please try again.",
    });
  }
});

// PUT /settings/credentials — upsert credentials for a single platform
router.put("/settings/credentials/:platform", requireAuth, async (req: any, res): Promise<void> => {
  const { platform } = req.params;
  try {
    if (!PLATFORMS.includes(platform as OAuthPlatform)) {
      res.status(400).json({ error: "Unsupported platform", message: `"${platform}" is not a supported platform.` });
      return;
    }

    const user = await getDbUser(req.clerkUserId);
    if (!user) {
      res.status(401).json({ error: "Unauthorized", message: "Session expired — please reload the page." });
      return;
    }

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
  } catch (err: any) {
    logger.error({ err, platform }, "Failed to save platform credentials");
    if (err.code === "42P01") {
      res.status(503).json({
        error: "Database table missing",
        message: "The credentials table has not been created yet. Please contact support.",
      });
      return;
    }
    if (err.code === "23505") {
      res.status(409).json({
        error: "Conflict",
        message: "A concurrent save occurred. Please refresh and try again.",
      });
      return;
    }
    res.status(500).json({
      error: "Database error",
      message: "Failed to save credentials. Please try again or contact support.",
    });
  }
});

// POST /settings/credentials/test/:platform — validate stored App ID + Secret against the platform API
// Currently only supports instagram and facebook (both use the Meta Graph API).
router.post("/settings/credentials/test/:platform", requireAuth, async (req: any, res): Promise<void> => {
  const { platform } = req.params;
  try {
    if (platform !== "instagram" && platform !== "facebook") {
      res.status(400).json({ ok: false, message: "Credential testing is only supported for Instagram and Facebook." });
      return;
    }

    const user = await getDbUser(req.clerkUserId);
    if (!user) {
      res.status(401).json({ ok: false, message: "Session expired — please reload the page." });
      return;
    }

    const [row] = await db.select({
      appId: platformOauthConfigsTable.appId,
      appSecret: platformOauthConfigsTable.appSecret,
    })
      .from(platformOauthConfigsTable)
      .where(and(
        eq(platformOauthConfigsTable.userId, user.id),
        eq(platformOauthConfigsTable.platform, platform),
      ));

    if (!row?.appId || !row?.appSecret) {
      res.status(422).json({ ok: false, message: "No credentials saved for this platform. Save your App ID and Secret first." });
      return;
    }

    let appSecret: string;
    try {
      appSecret = decryptToken(row.appSecret);
    } catch {
      res.status(500).json({ ok: false, message: "Stored credentials are corrupted. Please re-enter and save them." });
      return;
    }

    const accessToken = `${row.appId}|${appSecret}`;
    const url = `https://graph.facebook.com/v21.0/${encodeURIComponent(row.appId)}?fields=id,name&access_token=${encodeURIComponent(accessToken)}`;

    let graphRes: Response;
    try {
      graphRes = await fetch(url, { signal: AbortSignal.timeout(8000) });
    } catch (fetchErr: any) {
      logger.warn({ fetchErr, platform }, "Meta Graph API unreachable during credential test");
      res.status(502).json({ ok: false, message: "Could not reach Meta Graph API — check your network connection." });
      return;
    }

    const body = await graphRes.json() as any;

    if (!graphRes.ok || body?.error) {
      const reason = body?.error?.message ?? `HTTP ${graphRes.status}`;
      logger.info({ platform, appId: row.appId, reason }, "Meta credential test failed");
      res.json({ ok: false, message: `Meta rejected these credentials: ${reason}` });
      return;
    }

    logger.info({ platform, appId: row.appId, name: body?.name }, "Meta credential test passed");
    res.json({ ok: true, appName: body?.name ?? null });
  } catch (err: any) {
    logger.error({ err, platform }, "Unexpected error during credential test");
    res.status(500).json({ ok: false, message: "An unexpected error occurred during the test. Please try again." });
  }
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

  // YouTube: parse verification metadata stored in appSecret column (key itself lives in appId)
  let youtubeLastVerified: string | null = null;
  let youtubeKeyExpired: boolean | null = null;
  if (ytRow?.appSecret) {
    try {
      const meta = JSON.parse(ytRow.appSecret) as { lastVerified?: string; expired?: boolean };
      youtubeLastVerified = meta.lastVerified ?? null;
      youtubeKeyExpired = meta.expired ?? null;
    } catch {
      // ignore malformed metadata
    }
  }

  // Instagram: parse verification metadata stored in appId column (token lives in appSecret)
  let instagramLastVerified: string | null = null;
  let instagramKeyExpired: boolean | null = null;
  if (igRow?.appId) {
    try {
      const meta = JSON.parse(igRow.appId) as { lastVerified?: string; expired?: boolean };
      instagramLastVerified = meta.lastVerified ?? null;
      instagramKeyExpired = meta.expired ?? null;
    } catch {
      // ignore malformed metadata
    }
  }

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
    youtube: {
      configured: !!(ytRow?.appId) || !!process.env.YOUTUBE_API_KEY,
      envOverride: !!process.env.YOUTUBE_API_KEY,
      lastVerified: youtubeLastVerified,
      keyExpired: youtubeKeyExpired,
    },
    instagram: {
      configured: !!(igRow?.appSecret) || !!process.env.INSTAGRAM_ACCESS_TOKEN,
      envOverride: !!process.env.INSTAGRAM_ACCESS_TOKEN,
      lastVerified: instagramLastVerified,
      keyExpired: instagramKeyExpired,
    },
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
        // Reset verification metadata (appSecret) whenever a new key is saved
        .set({ appId: youtubeApiKey || null, appSecret: null, updatedAt: new Date() })
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
        // Reset verification metadata (appId) whenever a new token is saved
        .set({ appSecret: encrypted, appId: null, updatedAt: new Date() })
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
// Accepts ?skipIfLive=true: returns the last-persisted verification result without re-calling
// the Restream API. Use this when a live session is active to avoid latency spikes mid-broadcast.
router.post("/settings/live-api-keys/check-restream", requireAuth, async (req: any, res): Promise<void> => {
  const user = await getDbUser(req.clerkUserId);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const skipIfLive = req.query.skipIfLive === "true";

  // Fetch the stored row first (needed both for skipIfLive early-return and normal key resolution)
  const rows = await db.select()
    .from(platformOauthConfigsTable)
    .where(and(
      eq(platformOauthConfigsTable.userId, user.id),
      eq(platformOauthConfigsTable.platform, LIVE_API_PLATFORMS.restream),
    ));
  const rstRow = rows[0];

  if (skipIfLive) {
    // Return last-persisted result without making any outbound API call
    let lastVerified: string | null = null;
    let expired: boolean | null = null;
    if (rstRow?.appId) {
      try {
        const meta = JSON.parse(rstRow.appId) as { lastVerified?: string; expired?: boolean };
        lastVerified = meta.lastVerified ?? null;
        expired = meta.expired ?? null;
      } catch { /* ignore malformed */ }
    }
    res.json({ ok: expired !== true, expired: expired ?? false, lastVerified, skipped: true });
    return;
  }

  // Resolve which key to verify (env override takes precedence)
  let apiKey: string | null = null;
  let useEnvKey = false;
  if (process.env.RESTREAM_API_KEY) {
    apiKey = process.env.RESTREAM_API_KEY;
    useEnvKey = true;
  } else {
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

// POST /settings/live-api-keys/check-youtube — silently verify the stored key and persist result
// Accepts ?skipIfLive=true: returns the last-persisted verification result without re-calling
// the YouTube API. Use this when a live session is active to avoid latency spikes mid-broadcast.
router.post("/settings/live-api-keys/check-youtube", requireAuth, async (req: any, res): Promise<void> => {
  const user = await getDbUser(req.clerkUserId);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const skipIfLive = req.query.skipIfLive === "true";

  // Fetch the stored row first (needed both for skipIfLive early-return and normal key resolution)
  const rows = await db.select()
    .from(platformOauthConfigsTable)
    .where(and(
      eq(platformOauthConfigsTable.userId, user.id),
      eq(platformOauthConfigsTable.platform, LIVE_API_PLATFORMS.youtube),
    ));
  const ytRow = rows[0];

  if (skipIfLive) {
    // Return last-persisted result without making any outbound API call
    let lastVerified: string | null = null;
    let expired: boolean | null = null;
    if (ytRow?.appSecret) {
      try {
        const meta = JSON.parse(ytRow.appSecret) as { lastVerified?: string; expired?: boolean };
        lastVerified = meta.lastVerified ?? null;
        expired = meta.expired ?? null;
      } catch { /* ignore malformed */ }
    }
    res.json({ ok: expired !== true, expired: expired ?? false, lastVerified, skipped: true });
    return;
  }

  let apiKey: string | null = null;
  let useEnvKey = false;
  if (process.env.YOUTUBE_API_KEY) {
    apiKey = process.env.YOUTUBE_API_KEY;
    useEnvKey = true;
  } else {
    apiKey = ytRow?.appId ?? null;
  }

  if (!apiKey) {
    res.status(422).json({ ok: false, error: "No YouTube API key configured." });
    return;
  }

  let expired = false;
  let verifyError: string | null = null;

  try {
    // A lightweight public endpoint that validates the key without OAuth
    const url = `https://www.googleapis.com/youtube/v3/videos?part=id&chart=mostPopular&maxResults=1&key=${encodeURIComponent(apiKey)}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (response.status === 400 || response.status === 403) {
      const body = await response.json().catch(() => ({})) as { error?: { status?: string } };
      const status = body?.error?.status;
      if (status === "API_KEY_INVALID" || status === "PERMISSION_DENIED" || response.status === 400) {
        expired = true;
      } else {
        verifyError = `YouTube returned ${response.status}`;
      }
    } else if (!response.ok) {
      verifyError = `YouTube returned ${response.status}`;
    }
  } catch (err: any) {
    verifyError = err?.name === "TimeoutError" ? "Request timed out" : (err?.message ?? "Network error");
  }

  const lastVerified = new Date().toISOString();
  const meta = JSON.stringify({ lastVerified, expired });

  // Persist verification result in appSecret column (key itself lives in appId)
  if (!useEnvKey) {
    const [existing] = await db.select({ id: platformOauthConfigsTable.id })
      .from(platformOauthConfigsTable)
      .where(and(
        eq(platformOauthConfigsTable.userId, user.id),
        eq(platformOauthConfigsTable.platform, LIVE_API_PLATFORMS.youtube),
      ));
    if (existing) {
      await db.update(platformOauthConfigsTable)
        .set({ appSecret: meta, updatedAt: new Date() })
        .where(eq(platformOauthConfigsTable.id, existing.id));
    }
  }

  res.json({ ok: !expired && !verifyError, expired, lastVerified, error: verifyError });
});

// POST /settings/live-api-keys/check-instagram — silently verify the stored token and persist result
// Accepts ?skipIfLive=true: returns the last-persisted verification result without re-calling
// the Instagram API. Use this when a live session is active to avoid latency spikes mid-broadcast.
router.post("/settings/live-api-keys/check-instagram", requireAuth, async (req: any, res): Promise<void> => {
  const user = await getDbUser(req.clerkUserId);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const skipIfLive = req.query.skipIfLive === "true";

  // Fetch the stored row first (needed both for skipIfLive early-return and normal key resolution)
  const rows = await db.select()
    .from(platformOauthConfigsTable)
    .where(and(
      eq(platformOauthConfigsTable.userId, user.id),
      eq(platformOauthConfigsTable.platform, LIVE_API_PLATFORMS.instagram),
    ));
  const igRow = rows[0];

  if (skipIfLive) {
    // Return last-persisted result without making any outbound API call
    let lastVerified: string | null = null;
    let expired: boolean | null = null;
    if (igRow?.appId) {
      try {
        const meta = JSON.parse(igRow.appId) as { lastVerified?: string; expired?: boolean };
        lastVerified = meta.lastVerified ?? null;
        expired = meta.expired ?? null;
      } catch { /* ignore malformed */ }
    }
    res.json({ ok: expired !== true, expired: expired ?? false, lastVerified, skipped: true });
    return;
  }

  let accessToken: string | null = null;
  let useEnvKey = false;
  if (process.env.INSTAGRAM_ACCESS_TOKEN) {
    accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;
    useEnvKey = true;
  } else {
    accessToken = igRow?.appSecret ? decryptToken(igRow.appSecret) : null;
  }

  if (!accessToken) {
    res.status(422).json({ ok: false, error: "No Instagram access token configured." });
    return;
  }

  let expired = false;
  let verifyError: string | null = null;

  try {
    const url = `https://graph.instagram.com/me?fields=id,username&access_token=${encodeURIComponent(accessToken)}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (response.status === 400 || response.status === 401) {
      expired = true;
    } else if (!response.ok) {
      const body = await response.json().catch(() => ({})) as { error?: { code?: number } };
      const code = body?.error?.code;
      // Instagram error code 190 = token expired/invalid
      if (code === 190) {
        expired = true;
      } else {
        verifyError = `Instagram returned ${response.status}`;
      }
    }
  } catch (err: any) {
    verifyError = err?.name === "TimeoutError" ? "Request timed out" : (err?.message ?? "Network error");
  }

  const lastVerified = new Date().toISOString();
  const meta = JSON.stringify({ lastVerified, expired });

  // Persist verification result in appId column (token lives in appSecret)
  if (!useEnvKey) {
    const [existing] = await db.select({ id: platformOauthConfigsTable.id })
      .from(platformOauthConfigsTable)
      .where(and(
        eq(platformOauthConfigsTable.userId, user.id),
        eq(platformOauthConfigsTable.platform, LIVE_API_PLATFORMS.instagram),
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
      active: ch.active ?? ch.enabled ?? (ch.status === "active"),
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

// POST /settings/live-api-keys/test-youtube — validate a YouTube Data API key
router.post("/settings/live-api-keys/test-youtube", requireAuth, async (req: any, res): Promise<void> => {
  const user = await getDbUser(req.clerkUserId);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  let apiKey: string | null = (req.body as { apiKey?: string }).apiKey?.trim() || null;

  if (!apiKey) {
    if (process.env.YOUTUBE_API_KEY) {
      apiKey = process.env.YOUTUBE_API_KEY;
    } else {
      const rows = await db.select()
        .from(platformOauthConfigsTable)
        .where(and(
          eq(platformOauthConfigsTable.userId, user.id),
          eq(platformOauthConfigsTable.platform, LIVE_API_PLATFORMS.youtube),
        ));
      apiKey = rows[0]?.appId ?? null;
    }
  }

  if (!apiKey) {
    res.status(422).json({ ok: false, error: "No YouTube API key configured. Save or paste a key first." });
    return;
  }

  try {
    // Use a public endpoint that works with a server-side API key (no OAuth required)
    const url = `https://www.googleapis.com/youtube/v3/videos?part=id&chart=mostPopular&maxResults=1&key=${encodeURIComponent(apiKey)}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });

    if (response.status === 400 || response.status === 403) {
      const body = await response.json().catch(() => ({})) as any;
      const reason = body?.error?.errors?.[0]?.reason ?? body?.error?.message ?? null;
      res.json({ ok: false, invalid: true, reason });
      return;
    }

    if (!response.ok) {
      const text = await response.text().catch(() => response.statusText);
      res.json({ ok: false, error: `YouTube returned ${response.status}: ${text}` });
      return;
    }

    res.json({ ok: true });
  } catch (err: any) {
    if (err?.name === "TimeoutError" || err?.code === "ABORT_ERR") {
      res.status(504).json({ ok: false, error: "Request to YouTube timed out. Check your network or try again." });
    } else {
      res.status(502).json({ ok: false, error: err?.message ?? "Failed to reach YouTube API." });
    }
  }
});

// POST /settings/live-api-keys/test-instagram — validate an Instagram Graph API access token
router.post("/settings/live-api-keys/test-instagram", requireAuth, async (req: any, res): Promise<void> => {
  const user = await getDbUser(req.clerkUserId);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  let token: string | null = (req.body as { token?: string }).token?.trim() || null;

  if (!token) {
    if (process.env.INSTAGRAM_ACCESS_TOKEN) {
      token = process.env.INSTAGRAM_ACCESS_TOKEN;
    } else {
      const rows = await db.select()
        .from(platformOauthConfigsTable)
        .where(and(
          eq(platformOauthConfigsTable.userId, user.id),
          eq(platformOauthConfigsTable.platform, LIVE_API_PLATFORMS.instagram),
        ));
      const igRow = rows[0];
      token = igRow?.appSecret ? decryptToken(igRow.appSecret) : null;
    }
  }

  if (!token) {
    res.status(422).json({ ok: false, error: "No Instagram access token configured. Save or paste a token first." });
    return;
  }

  try {
    const url = `https://graph.instagram.com/me?fields=id,name&access_token=${encodeURIComponent(token)}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });

    if (response.status === 401 || response.status === 400 || response.status === 403) {
      const body = await response.json().catch(() => ({})) as any;
      const reason = body?.error?.message ?? null;
      res.json({ ok: false, invalid: true, reason });
      return;
    }

    if (!response.ok) {
      const text = await response.text().catch(() => response.statusText);
      res.json({ ok: false, error: `Instagram returned ${response.status}: ${text}` });
      return;
    }

    const data = await response.json() as any;
    res.json({ ok: true, accountId: data?.id ?? null, accountName: data?.name ?? null });
  } catch (err: any) {
    if (err?.name === "TimeoutError" || err?.code === "ABORT_ERR") {
      res.status(504).json({ ok: false, error: "Request to Instagram timed out. Check your network or try again." });
    } else {
      res.status(502).json({ ok: false, error: err?.message ?? "Failed to reach Instagram API." });
    }
  }
});

// GET /settings/live-api-keys/restream-channels — fetch destination channels using the stored key
router.get("/settings/live-api-keys/restream-channels", requireAuth, async (req: any, res): Promise<void> => {
  const user = await getDbUser(req.clerkUserId);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  let apiKey: string | null = null;
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

  if (!apiKey) {
    res.json({ ok: false, configured: false, channels: [] });
    return;
  }

  try {
    const response = await fetch("https://api.restream.io/v2/channel", {
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(8000),
    });

    if (response.status === 401 || response.status === 403) {
      res.json({ ok: false, configured: true, invalid: true, channels: [] });
      return;
    }

    if (!response.ok) {
      const text = await response.text().catch(() => response.statusText);
      res.json({ ok: false, configured: true, error: `Restream returned ${response.status}: ${text}`, channels: [] });
      return;
    }

    const data = await response.json() as unknown;
    const raw = Array.isArray(data) ? data : ((data as any)?.items ?? []);
    const channels = raw.map((ch: any) => ({
      id: ch.id ?? ch.channelId,
      displayName: ch.displayName ?? ch.name ?? ch.platform ?? "Unknown",
      platform: ch.type ?? ch.platform ?? "unknown",
      active: ch.active ?? ch.enabled ?? (ch.status === "active"),
    }));

    res.json({ ok: true, configured: true, channels });
  } catch (err: any) {
    if (err?.name === "TimeoutError" || err?.code === "ABORT_ERR") {
      res.status(504).json({ ok: false, configured: true, error: "Request to Restream timed out." });
    } else {
      res.status(502).json({ ok: false, configured: true, error: err?.message ?? "Failed to reach Restream API." });
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
