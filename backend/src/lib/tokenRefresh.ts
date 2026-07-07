/**
 * tokenRefresh.ts
 *
 * Refresh expired OAuth access tokens for each supported platform.
 * Returns new token data on success, throws on failure so the caller
 * can flag the account as requiring manual reconnection.
 *
 * Supported:
 *   instagram   → fb_exchange_token on long-lived user token → re-fetch page token
 *   facebook    → fb_exchange_token on long-lived user token → re-fetch page token
 *   tiktok      → refresh_token grant
 *   youtube     → refresh_token grant (Google OAuth2)
 *   x           → refresh_token grant (Twitter OAuth2)
 *
 * Meta token model:
 *   platform_accounts.accessToken  = Page access token (used for API calls)
 *   platform_accounts.refreshToken = Long-lived User access token (used for refresh)
 *
 *   fb_exchange_token only works with User tokens. The refreshed User token
 *   is then used to re-fetch a fresh Page token from /me/accounts.
 */

import { getDbUserCredentials } from "../routes/settings.js";
import { logger } from "./logger.js";

export interface RefreshedTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
}

// ─── Per-platform refresh implementations ────────────────────────────────────

/**
 * Refresh Meta (Instagram / Facebook) tokens.
 *
 * @param userTokenPlain  The long-lived User Access Token stored in `refreshToken` column.
 *                        This is what fb_exchange_token accepts — NOT the Page access token.
 * @param platformUserId  The stored platform user ID; for Instagram this is the IG Business Account ID,
 *                        for Facebook this is the Page ID.
 */
async function refreshMetaToken(
  userId: number,
  platform: "instagram" | "facebook",
  userTokenPlain: string,
  platformUserId: string | null
): Promise<RefreshedTokens> {
  const { appId, appSecret } = await getDbUserCredentials(userId, platform);
  const clientId = appId ?? process.env[platform === "instagram" ? "INSTAGRAM_APP_ID" : "FACEBOOK_APP_ID"] ?? "";
  const clientSecret = appSecret ?? process.env[platform === "instagram" ? "INSTAGRAM_APP_SECRET" : "FACEBOOK_APP_SECRET"] ?? "";

  if (!clientId || !clientSecret) {
    throw new Error(`${platform} app credentials not configured`);
  }

  // Step 1: exchange existing long-lived user token for a new one
  const params = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: clientId,
    client_secret: clientSecret,
    fb_exchange_token: userTokenPlain,
  });

  const res = await fetch(`https://graph.facebook.com/v18.0/oauth/access_token?${params}`);
  const data = await res.json() as any;

  if (!res.ok) {
    throw new Error(data?.error?.message ?? `${platform} user token refresh failed (HTTP ${res.status})`);
  }

  const newUserToken: string = data.access_token;
  const expiresAt = data.expires_in
    ? new Date(Date.now() + Number(data.expires_in) * 1000)
    : new Date(Date.now() + 60 * 24 * 3600 * 1000); // default 60-day fallback

  // Step 2: re-fetch the Page access token using the refreshed user token
  let newPageToken: string = newUserToken; // fallback if page lookup fails

  if (platform === "instagram") {
    try {
      const pagesRes = await fetch(
        `https://graph.facebook.com/v18.0/me/accounts?fields=id,name,access_token,instagram_business_account&access_token=${newUserToken}`
      );
      const pagesData = await pagesRes.json() as any;
      // Find the page whose Instagram Business Account ID matches what we stored
      const igPage = (pagesData.data ?? []).find((p: any) =>
        p.instagram_business_account?.id &&
        (!platformUserId || p.instagram_business_account.id === platformUserId)
      );
      if (igPage) newPageToken = igPage.access_token;
    } catch {
      // Non-fatal: fall back to using the refreshed user token for API calls
      logger.warn({ userId, platform }, "[tokenRefresh] could not re-fetch Instagram page token; using user token");
    }
  } else {
    // Facebook: get the Page token for the stored Page ID
    try {
      const pagesRes = await fetch(
        `https://graph.facebook.com/v18.0/me/accounts?fields=id,name,access_token&access_token=${newUserToken}`
      );
      const pagesData = await pagesRes.json() as any;
      const pages = pagesData.data ?? [];
      const page = platformUserId
        ? pages.find((p: any) => p.id === platformUserId)
        : pages[0];
      if (page) newPageToken = page.access_token;
    } catch {
      logger.warn({ userId, platform }, "[tokenRefresh] could not re-fetch Facebook page token; using user token");
    }
  }

  return {
    accessToken: newPageToken,
    refreshToken: newUserToken, // persist the fresh user token for the next refresh cycle
    expiresAt,
  };
}

async function refreshTikTokToken(
  userId: number,
  refreshTokenPlain: string
): Promise<RefreshedTokens> {
  const { appId, appSecret } = await getDbUserCredentials(userId, "tiktok");
  const clientKey = appId ?? process.env.TIKTOK_CLIENT_KEY ?? "";
  const clientSecret = appSecret ?? process.env.TIKTOK_CLIENT_SECRET ?? "";

  if (!clientKey || !clientSecret) {
    throw new Error("TikTok app credentials not configured");
  }

  const body = new URLSearchParams({
    client_key: clientKey,
    client_secret: clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshTokenPlain,
  });

  const res = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const data = await res.json() as any;

  if (!res.ok || data.error) {
    throw new Error(data.error_description ?? data.message ?? `TikTok token refresh failed (HTTP ${res.status})`);
  }

  const expiresAt = data.expires_in
    ? new Date(Date.now() + Number(data.expires_in) * 1000)
    : undefined;

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt,
  };
}

async function refreshYouTubeToken(
  userId: number,
  refreshTokenPlain: string
): Promise<RefreshedTokens> {
  const { appId, appSecret } = await getDbUserCredentials(userId, "youtube");
  const clientId = appId ?? process.env.YOUTUBE_CLIENT_ID ?? "";
  const clientSecret = appSecret ?? process.env.YOUTUBE_CLIENT_SECRET ?? "";

  if (!clientId || !clientSecret) {
    throw new Error("YouTube app credentials not configured");
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshTokenPlain,
  });

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const data = await res.json() as any;

  if (!res.ok) {
    throw new Error(data.error_description ?? data.error ?? `YouTube token refresh failed (HTTP ${res.status})`);
  }

  const expiresAt = data.expires_in
    ? new Date(Date.now() + Number(data.expires_in) * 1000)
    : undefined;

  return {
    accessToken: data.access_token,
    expiresAt,
  };
}

async function refreshXToken(
  userId: number,
  refreshTokenPlain: string
): Promise<RefreshedTokens> {
  const { appId, appSecret } = await getDbUserCredentials(userId, "x");
  const clientId = appId ?? process.env.X_CLIENT_ID ?? "";
  const clientSecret = appSecret ?? process.env.X_CLIENT_SECRET ?? "";

  if (!clientId || !clientSecret) {
    throw new Error("X (Twitter) app credentials not configured");
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshTokenPlain,
    client_id: clientId,
  });

  const res = await fetch("https://api.twitter.com/2/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: body.toString(),
  });
  const data = await res.json() as any;

  if (!res.ok) {
    throw new Error(data.error_description ?? data.error ?? `X token refresh failed (HTTP ${res.status})`);
  }

  const expiresAt = data.expires_in
    ? new Date(Date.now() + Number(data.expires_in) * 1000)
    : undefined;

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt,
  };
}

// ─── Public entry point ──────────────────────────────────────────────────────

/**
 * Attempt to refresh the access token for a platform account.
 *
 * @param userId              - DB user id (used to look up per-user OAuth app credentials)
 * @param platform            - The social platform name
 * @param currentAccessToken  - Current (plain-text) page/access token used for API calls
 * @param refreshTokenPlain   - Plain-text refresh token. For Meta platforms this MUST be
 *                              the long-lived User Access Token (stored in refreshToken column),
 *                              NOT the page token. For other platforms it is the OAuth refresh token.
 * @param platformUserId      - Optional: stored platform user ID; used by Meta to re-fetch
 *                              the correct Page access token after refreshing the user token.
 * @returns             RefreshedTokens with new access token (and optional refresh token + expiry)
 * @throws              If the refresh fails or credentials are missing
 */
export async function refreshPlatformToken(
  userId: number,
  platform: string,
  currentAccessToken: string,
  refreshTokenPlain: string | null,
  platformUserId?: string | null
): Promise<RefreshedTokens> {
  logger.info({ userId, platform }, "[tokenRefresh] attempting token refresh");

  switch (platform) {
    case "instagram":
    case "facebook": {
      // Meta refresh requires the long-lived User token (stored in refreshToken column).
      // If unavailable (legacy accounts that never stored it), fall back to trying the
      // page token with fb_exchange_token — it may work if the page token is still valid
      // enough to be exchanged.
      const metaUserToken = refreshTokenPlain ?? currentAccessToken;
      return refreshMetaToken(userId, platform as "instagram" | "facebook", metaUserToken, platformUserId ?? null);
    }

    case "tiktok":
      if (!refreshTokenPlain) throw new Error("TikTok refresh token not stored — manual reconnect required");
      return refreshTikTokToken(userId, refreshTokenPlain);

    case "youtube":
      if (!refreshTokenPlain) throw new Error("YouTube refresh token not stored — manual reconnect required");
      return refreshYouTubeToken(userId, refreshTokenPlain);

    case "x":
      if (!refreshTokenPlain) throw new Error("X refresh token not stored — manual reconnect required");
      return refreshXToken(userId, refreshTokenPlain);

    default:
      throw new Error(`Token refresh not supported for platform: ${platform}`);
  }
}
