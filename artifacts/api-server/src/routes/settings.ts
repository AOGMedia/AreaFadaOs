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

export { getDbUserCredentials };

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
