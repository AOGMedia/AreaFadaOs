import { Router } from "express";
import { randomBytes, createHash } from "node:crypto";
import { db } from "@workspace/db";
import { platformAccountsTable, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import { encryptToken } from "../lib/tokenEncryption.js";
import { fetchFollowerCount } from "../lib/platformPublisher.js";

const router = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function baseUrl(): string {
  const domain = process.env.REPLIT_DEV_DOMAIN ?? "localhost:3000";
  return `https://${domain}/areafadaos/api`;
}

function callbackUrl(platform: string): string {
  return `${baseUrl()}/oauth/${platform}/callback`;
}

async function getDbUser(clerkId: string) {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  return user ?? null;
}

// ─── requireAuth middleware (copied pattern from users.ts) ────────────────────

const requireAuth = (req: any, res: any, next: any) => {
  const auth = getAuth(req);
  const rawId = auth?.sessionClaims?.userId || auth?.userId;
  const userId = typeof rawId === "string" ? rawId : null;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  req.clerkUserId = userId;
  next();
};

// ─── Platform OAuth configs ───────────────────────────────────────────────────

function xAuthUrl(state: string, codeChallenge: string, redirectUri: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.X_CLIENT_ID ?? "",
    redirect_uri: redirectUri,
    scope: "tweet.read tweet.write users.read offline.access",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });
  return `https://twitter.com/i/oauth2/authorize?${params}`;
}

function instagramAuthUrl(state: string, redirectUri: string): string {
  // Instagram Graph API publishing requires Facebook Login — NOT the Basic Display API.
  // The app must be a Facebook App with "Instagram Graph API" added as a product.
  // Scopes: instagram_basic to read account info, instagram_content_publish to post.
  const params = new URLSearchParams({
    client_id: process.env.INSTAGRAM_APP_ID ?? "",
    redirect_uri: redirectUri,
    scope: "instagram_basic,instagram_content_publish,pages_read_engagement",
    response_type: "code",
    state,
  });
  return `https://www.facebook.com/v18.0/dialog/oauth?${params}`;
}

function facebookAuthUrl(state: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: process.env.FACEBOOK_APP_ID ?? "",
    redirect_uri: redirectUri,
    scope: "pages_manage_posts,pages_read_engagement,publish_to_groups",
    response_type: "code",
    state,
  });
  return `https://www.facebook.com/v18.0/dialog/oauth?${params}`;
}

function tiktokAuthUrl(state: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_key: process.env.TIKTOK_CLIENT_KEY ?? "",
    redirect_uri: redirectUri,
    scope: "user.info.basic,video.upload,video.publish",
    response_type: "code",
    state,
  });
  return `https://www.tiktok.com/v2/auth/authorize?${params}`;
}

// ─── /oauth/:platform/start ───────────────────────────────────────────────────

router.get("/oauth/:platform/start", requireAuth, async (req: any, res): Promise<void> => {
  const { platform } = req.params;
  const supported = ["x", "instagram", "facebook", "tiktok"];
  if (!supported.includes(platform)) {
    res.status(400).json({ error: `Unsupported platform: ${platform}` });
    return;
  }

  const user = await getDbUser(req.clerkUserId);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const state = randomBytes(24).toString("hex");
  // Store userId|platform|codeVerifier in state-blob (split on first ":")
  const codeVerifier = randomBytes(32).toString("hex");
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
  const stateBlob = `${user.id}:${codeVerifier}:${state}`;

  // Upsert a placeholder row to store the state for the callback
  const [existing] = await db.select({ id: platformAccountsTable.id })
    .from(platformAccountsTable)
    .where(and(eq(platformAccountsTable.userId, user.id), eq(platformAccountsTable.platform, platform)));

  if (existing) {
    await db.update(platformAccountsTable)
      .set({ oauthState: stateBlob, updatedAt: new Date() })
      .where(eq(platformAccountsTable.id, existing.id));
  } else {
    await db.insert(platformAccountsTable).values({
      userId: user.id,
      platform,
      handle: "pending",
      connected: false,
      oauthState: stateBlob,
    });
  }

  const redirect = callbackUrl(platform);
  let authUrl: string;

  switch (platform) {
    case "x": authUrl = xAuthUrl(state, codeChallenge, redirect); break;
    case "instagram": authUrl = instagramAuthUrl(state, redirect); break;
    case "facebook": authUrl = facebookAuthUrl(state, redirect); break;
    case "tiktok": authUrl = tiktokAuthUrl(state, redirect); break;
    default: res.status(400).json({ error: "Unknown platform" }); return;
  }

  res.redirect(authUrl);
});

// ─── /oauth/:platform/callback ────────────────────────────────────────────────

router.get("/oauth/:platform/callback", async (req: any, res): Promise<void> => {
  const { platform } = req.params;
  const { code, state: returnedState, error: oauthError } = req.query as Record<string, string>;
  const frontendBase = `${process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : ""}/areafadaos`;

  if (oauthError) {
    res.redirect(`${frontendBase}/scheduling?oauth_error=${encodeURIComponent(oauthError)}&platform=${platform}`);
    return;
  }

  if (!code || !returnedState) {
    res.redirect(`${frontendBase}/scheduling?oauth_error=missing_code&platform=${platform}`);
    return;
  }

  // Find the account row whose state blob contains this exact state token.
  // The state blob is stored as "userId:codeVerifier:state" so we match by the
  // suffix to correctly identify which user+platform row to use.
  const allForPlatform = await db.select().from(platformAccountsTable)
    .where(eq(platformAccountsTable.platform, platform));

  const account = allForPlatform.find((a) => {
    if (!a.oauthState) return false;
    const parts = a.oauthState.split(":");
    return parts.length === 3 && parts[2] === returnedState;
  });

  if (!account) {
    res.redirect(`${frontendBase}/scheduling?oauth_error=invalid_state&platform=${platform}`);
    return;
  }

  const [userId, codeVerifier] = account.oauthState!.split(":");

  const redirect = callbackUrl(platform);

  try {
    let accessToken: string;
    let refreshToken: string | null = null;
    let expiresAt: Date | null = null;
    let platformUserId: string;
    let handle: string;
    let displayName: string | null = null;
    let scopes: string[] = [];

    switch (platform) {
      case "x": {
        const body = new URLSearchParams({
          code,
          grant_type: "authorization_code",
          redirect_uri: redirect,
          code_verifier: codeVerifier,
          client_id: process.env.X_CLIENT_ID ?? "",
        });
        const tokenRes = await fetch("https://api.twitter.com/2/oauth2/token", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Authorization": `Basic ${Buffer.from(`${process.env.X_CLIENT_ID}:${process.env.X_CLIENT_SECRET}`).toString("base64")}`,
          },
          body: body.toString(),
        });
        const tokenData = await tokenRes.json() as any;
        if (!tokenRes.ok) throw new Error(tokenData.error_description ?? "X token exchange failed");
        accessToken = tokenData.access_token;
        refreshToken = tokenData.refresh_token ?? null;
        expiresAt = tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000) : null;
        scopes = (tokenData.scope ?? "").split(" ");

        const meRes = await fetch("https://api.twitter.com/2/users/me?user.fields=public_metrics,name,username", {
          headers: { "Authorization": `Bearer ${accessToken}` },
        });
        const meData = await meRes.json() as any;
        platformUserId = meData.data?.id ?? "";
        handle = `@${meData.data?.username ?? "unknown"}`;
        displayName = meData.data?.name ?? null;
        break;
      }

      case "instagram": {
        // Step 1: Exchange code for a short-lived user access token via Facebook Login
        const igParams = new URLSearchParams({
          client_id: process.env.INSTAGRAM_APP_ID ?? "",
          client_secret: process.env.INSTAGRAM_APP_SECRET ?? "",
          redirect_uri: redirect,
          code,
        });
        const igTokenRes = await fetch(`https://graph.facebook.com/v18.0/oauth/access_token?${igParams}`);
        const igTokenData = await igTokenRes.json() as any;
        if (!igTokenRes.ok) throw new Error(igTokenData.error?.message ?? "Instagram token exchange failed");
        const userToken = igTokenData.access_token;

        // Step 2: Enumerate Pages; find the first one with an Instagram Business Account
        const pagesRes = await fetch(
          `https://graph.facebook.com/v18.0/me/accounts?fields=id,name,access_token,instagram_business_account&access_token=${userToken}`
        );
        const pagesData = await pagesRes.json() as any;
        const igPage = (pagesData.data ?? []).find((p: any) => p.instagram_business_account?.id);
        if (!igPage) {
          throw new Error(
            "No Instagram Business Account found. Make sure your Instagram Professional account is connected to a Facebook Page."
          );
        }

        // Use the Page access token (long-lived) and IG Business Account ID for publishing
        accessToken = igPage.access_token;
        platformUserId = igPage.instagram_business_account.id;

        // Step 3: Fetch the IG username and follower count
        const igMeRes = await fetch(
          `https://graph.facebook.com/v18.0/${platformUserId}?fields=username,followers_count&access_token=${accessToken}`
        );
        const igMeData = await igMeRes.json() as any;
        handle = `@${igMeData.username ?? "unknown"}`;
        break;
      }

      case "facebook": {
        // Step 1: Exchange code for user access token
        const fbParams = new URLSearchParams({
          client_id: process.env.FACEBOOK_APP_ID ?? "",
          client_secret: process.env.FACEBOOK_APP_SECRET ?? "",
          redirect_uri: redirect,
          code,
        });
        const fbTokenRes = await fetch(`https://graph.facebook.com/v18.0/oauth/access_token?${fbParams}`);
        const fbTokenData = await fbTokenRes.json() as any;
        if (!fbTokenRes.ok) throw new Error(fbTokenData.error?.message ?? "Facebook token exchange failed");
        const fbUserToken = fbTokenData.access_token;

        // Step 2: Get managed Pages — publishing requires Page access tokens, not user tokens
        const fbPagesRes = await fetch(
          `https://graph.facebook.com/v18.0/me/accounts?fields=id,name,access_token&access_token=${fbUserToken}`
        );
        const fbPagesData = await fbPagesRes.json() as any;
        const pages = fbPagesData.data ?? [];
        if (pages.length === 0) {
          throw new Error("No Facebook Pages found. Create or connect a Facebook Page to use for publishing.");
        }

        // Use first managed Page (page access token + page ID for publishing)
        const page = pages[0];
        accessToken = page.access_token;
        platformUserId = page.id;
        handle = page.name ?? "Facebook Page";
        displayName = page.name ?? null;
        break;
      }

      case "tiktok": {
        const body = new URLSearchParams({
          client_key: process.env.TIKTOK_CLIENT_KEY ?? "",
          client_secret: process.env.TIKTOK_CLIENT_SECRET ?? "",
          code,
          grant_type: "authorization_code",
          redirect_uri: redirect,
          code_verifier: codeVerifier,
        });
        const tokenRes = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: body.toString(),
        });
        const tokenData = await tokenRes.json() as any;
        if (!tokenRes.ok) throw new Error(tokenData.error_description ?? "TikTok token exchange failed");
        accessToken = tokenData.access_token;
        refreshToken = tokenData.refresh_token ?? null;
        expiresAt = tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000) : null;
        scopes = (tokenData.scope ?? "").split(",");
        platformUserId = tokenData.open_id ?? "";

        const meRes = await fetch("https://open.tiktokapis.com/v2/user/info/?fields=display_name,username", {
          headers: { "Authorization": `Bearer ${accessToken}` },
        });
        const meData = await meRes.json() as any;
        handle = `@${meData.data?.user?.username ?? meData.data?.user?.display_name ?? "unknown"}`;
        displayName = meData.data?.user?.display_name ?? null;
        break;
      }

      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }

    // Fetch live follower count
    const followerCount = await fetchFollowerCount(platform, accessToken, platformUserId);

    await db.update(platformAccountsTable).set({
      handle,
      displayName,
      connected: true,
      accessToken: encryptToken(accessToken),
      refreshToken: refreshToken ? encryptToken(refreshToken) : null,
      tokenExpiresAt: expiresAt,
      platformUserId,
      scopes,
      followerCount,
      oauthState: null,
      errorMessage: null,
      errorCode: null,
      updatedAt: new Date(),
    }).where(and(
      eq(platformAccountsTable.userId, Number(userId)),
      eq(platformAccountsTable.platform, platform)
    ));

    res.redirect(`${frontendBase}/scheduling?oauth_success=${platform}`);
  } catch (err: any) {
    console.error(`[oauth] ${platform} callback error:`, err.message);
    await db.update(platformAccountsTable).set({
      errorMessage: err.message,
      oauthState: null,
      updatedAt: new Date(),
    }).where(and(
      eq(platformAccountsTable.userId, Number(userId)),
      eq(platformAccountsTable.platform, platform)
    ));
    res.redirect(`${frontendBase}/scheduling?oauth_error=${encodeURIComponent(err.message)}&platform=${platform}`);
  }
});

// ─── Disconnect ───────────────────────────────────────────────────────────────

router.delete("/oauth/:platform/disconnect", requireAuth, async (req: any, res): Promise<void> => {
  const { platform } = req.params;
  const user = await getDbUser(req.clerkUserId);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  await db.update(platformAccountsTable).set({
    connected: false,
    accessToken: null,
    refreshToken: null,
    tokenExpiresAt: null,
    platformUserId: null,
    scopes: null,
    errorMessage: null,
    errorCode: null,
    updatedAt: new Date(),
  }).where(and(
    eq(platformAccountsTable.userId, user.id),
    eq(platformAccountsTable.platform, platform)
  ));

  res.json({ message: `${platform} account disconnected` });
});

export default router;
