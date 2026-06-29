import { db } from "@workspace/db";
import { publishJobsTable, platformAccountsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { decryptToken, encryptToken, isTokenExpired } from "./tokenEncryption.js";

export type ErrorCode = "rate_limit" | "auth_failure" | "content_policy" | "server_error" | "unknown";

interface PublishResult {
  platformPostId?: string;
}

// ─── Error classification ─────────────────────────────────────────────────────

export function classifyError(err: any): { errorCode: ErrorCode; shouldRetry: boolean; retryAfterMs?: number } {
  const status = Number(err.status ?? err.statusCode ?? 0);
  const msg = String(err.message ?? "").toLowerCase();

  if (status === 429 || msg.includes("rate limit") || msg.includes("too many request")) {
    const retryAfterSec = Number(err.retryAfter ?? 900);
    return { errorCode: "rate_limit", shouldRetry: true, retryAfterMs: retryAfterSec * 1000 };
  }
  if (status === 401 || status === 403 || msg.includes("unauthorized") || msg.includes("invalid token") || msg.includes("token expired") || msg.includes("oauth")) {
    return { errorCode: "auth_failure", shouldRetry: false };
  }
  if (status === 422 || msg.includes("content policy") || msg.includes("violat") || msg.includes("spam") || msg.includes("sensitive")) {
    return { errorCode: "content_policy", shouldRetry: false };
  }
  if (status >= 500) {
    return { errorCode: "server_error", shouldRetry: true };
  }
  return { errorCode: "unknown", shouldRetry: false };
}

// ─── HTTP helper ──────────────────────────────────────────────────────────────

async function fetchJSON(url: string, options: RequestInit): Promise<any> {
  const res = await fetch(url, options);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err: any = new Error(body.error?.message ?? body.message ?? `HTTP ${res.status}`);
    err.status = res.status;
    err.body = body;
    err.retryAfter = res.headers.get("retry-after") ?? undefined;
    throw err;
  }
  return body;
}

// ─── X (Twitter v2) ──────────────────────────────────────────────────────────

async function publishToX(accessToken: string, job: any): Promise<PublishResult> {
  const fullText = [job.caption, ...(job.hashtags ?? [])].filter(Boolean).join(" ");
  const text = fullText.slice(0, 280);

  const body: any = { text };

  if ((job.mediaUrls as string[])?.length > 0) {
    const mediaIds: string[] = [];
    for (const mediaUrl of (job.mediaUrls as string[]).slice(0, 4)) {
      const uploaded = await uploadMediaToX(accessToken, mediaUrl);
      if (uploaded) mediaIds.push(uploaded);
    }
    if (mediaIds.length > 0) body.media = { media_ids: mediaIds };
  }

  const data = await fetchJSON("https://api.twitter.com/2/tweets", {
    method: "POST",
    headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { platformPostId: data.data?.id };
}

async function uploadMediaToX(accessToken: string, mediaUrl: string): Promise<string | null> {
  try {
    const imgRes = await fetch(mediaUrl);
    if (!imgRes.ok) return null;
    const buffer = await imgRes.arrayBuffer();
    const mimeType = imgRes.headers.get("content-type") ?? "image/jpeg";
    const form = new FormData();
    form.append("media_data", Buffer.from(buffer).toString("base64"));
    const data = await fetchJSON("https://upload.twitter.com/1.1/media/upload.json", {
      method: "POST",
      headers: { "Authorization": `Bearer ${accessToken}` },
      body: form,
    });
    return String(data.media_id_string);
  } catch { return null; }
}

// ─── Instagram Graph API ─────────────────────────────────────────────────────

async function publishToInstagram(accessToken: string, platformUserId: string, job: any): Promise<PublishResult> {
  // Uses Instagram Graph API via graph.facebook.com — requires an Instagram Business
  // or Creator account connected to a Facebook Page.
  const caption = [job.caption, ...(job.hashtags ?? [])].filter(Boolean).join(" ");
  const mediaUrls = (job.mediaUrls as string[]) ?? [];

  if (mediaUrls.length === 0) {
    throw Object.assign(new Error("Instagram requires at least one media URL (image or video)"), { status: 422 });
  }

  const mediaUrl = mediaUrls[0];
  const isVideo = /\.(mp4|mov|avi|mkv)$/i.test(mediaUrl);
  const params = new URLSearchParams({
    ...(isVideo ? { video_url: mediaUrl, media_type: "REELS" } : { image_url: mediaUrl }),
    caption,
    access_token: accessToken,
  });

  // Step 1: Create media container
  const containerData = await fetchJSON(
    `https://graph.facebook.com/v18.0/${platformUserId}/media?${params}`,
    { method: "POST" }
  );

  // Step 2: Publish the container
  const publishParams = new URLSearchParams({
    creation_id: containerData.id,
    access_token: accessToken,
  });
  const publishData = await fetchJSON(
    `https://graph.facebook.com/v18.0/${platformUserId}/media_publish?${publishParams}`,
    { method: "POST" }
  );
  return { platformPostId: publishData.id };
}

// ─── Facebook Graph API ───────────────────────────────────────────────────────

async function publishToFacebook(accessToken: string, platformUserId: string, job: any): Promise<PublishResult> {
  const message = [job.caption, ...(job.hashtags ?? [])].filter(Boolean).join(" ");
  const mediaUrls = (job.mediaUrls as string[]) ?? [];

  if (mediaUrls.length > 0) {
    const params = new URLSearchParams({
      url: mediaUrls[0],
      caption: message,
      access_token: accessToken,
    });
    const data = await fetchJSON(
      `https://graph.facebook.com/v18.0/${platformUserId}/photos?${params}`,
      { method: "POST" }
    );
    return { platformPostId: data.post_id ?? data.id };
  }

  const params = new URLSearchParams({ message, access_token: accessToken });
  const data = await fetchJSON(
    `https://graph.facebook.com/v18.0/${platformUserId}/feed?${params}`,
    { method: "POST" }
  );
  return { platformPostId: data.id };
}

// ─── TikTok Content Posting API ──────────────────────────────────────────────

async function publishToTikTok(accessToken: string, job: any): Promise<PublishResult> {
  const mediaUrls = (job.mediaUrls as string[]) ?? [];
  if (mediaUrls.length === 0) {
    throw Object.assign(new Error("TikTok requires a video URL"), { status: 422 });
  }

  const title = [job.caption, ...(job.hashtags ?? [])].filter(Boolean).join(" ").slice(0, 150);

  const data = await fetchJSON("https://open.tiktokapis.com/v2/post/publish/video/init/", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify({
      post_info: {
        title,
        privacy_level: "PUBLIC_TO_EVERYONE",
        disable_duet: false,
        disable_comment: false,
        disable_stitch: false,
      },
      source_info: {
        source: "PULL_FROM_URL",
        video_url: mediaUrls[0],
      },
    }),
  });
  return { platformPostId: data.data?.publish_id };
}

// ─── Token refresh ────────────────────────────────────────────────────────────

async function tryRefreshToken(account: any): Promise<boolean> {
  if (!account.refreshToken) return false;
  try {
    const refreshToken = decryptToken(account.refreshToken);
    let newAccessToken: string | null = null;
    let newRefreshToken: string | null = null;
    let newExpiresAt: Date | null = null;

    if (account.platform === "x") {
      const body = new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: process.env.X_CLIENT_ID ?? "",
      });
      const data = await fetchJSON("https://api.twitter.com/2/oauth2/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Authorization": `Basic ${Buffer.from(`${process.env.X_CLIENT_ID}:${process.env.X_CLIENT_SECRET}`).toString("base64")}`,
        },
        body: body.toString(),
      });
      newAccessToken = data.access_token;
      newRefreshToken = data.refresh_token;
      newExpiresAt = data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : null;
    } else if (account.platform === "instagram" || account.platform === "facebook") {
      const appId = account.platform === "instagram" ? process.env.INSTAGRAM_APP_ID : process.env.FACEBOOK_APP_ID;
      const appSecret = account.platform === "instagram" ? process.env.INSTAGRAM_APP_SECRET : process.env.FACEBOOK_APP_SECRET;
      const params = new URLSearchParams({
        grant_type: "fb_exchange_token",
        client_id: appId ?? "",
        client_secret: appSecret ?? "",
        fb_exchange_token: refreshToken,
      });
      const data = await fetchJSON(`https://graph.facebook.com/v18.0/oauth/access_token?${params}`, { method: "GET" });
      newAccessToken = data.access_token;
      newExpiresAt = data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : null;
    }

    if (!newAccessToken) return false;
    await db.update(platformAccountsTable).set({
      accessToken: encryptToken(newAccessToken),
      ...(newRefreshToken ? { refreshToken: encryptToken(newRefreshToken) } : {}),
      tokenExpiresAt: newExpiresAt,
      updatedAt: new Date(),
    }).where(eq(platformAccountsTable.id, account.id));
    return true;
  } catch { return false; }
}

// ─── Live follower count ──────────────────────────────────────────────────────

export async function fetchFollowerCount(platform: string, accessToken: string, platformUserId: string): Promise<number> {
  try {
    switch (platform) {
      case "x": {
        const data = await fetchJSON(
          `https://api.twitter.com/2/users/${platformUserId}?user.fields=public_metrics`,
          { headers: { "Authorization": `Bearer ${accessToken}` } }
        );
        return data.data?.public_metrics?.followers_count ?? 0;
      }
      case "instagram": {
        // IG Business Account metrics are served via graph.facebook.com, not graph.instagram.com
        const data = await fetchJSON(
          `https://graph.facebook.com/v18.0/${platformUserId}?fields=followers_count&access_token=${accessToken}`,
          {}
        );
        return data.followers_count ?? 0;
      }
      case "facebook": {
        const data = await fetchJSON(
          `https://graph.facebook.com/v18.0/${platformUserId}?fields=fan_count&access_token=${accessToken}`,
          {}
        );
        return data.fan_count ?? 0;
      }
      case "tiktok": {
        const data = await fetchJSON(
          "https://open.tiktokapis.com/v2/user/info/?fields=follower_count",
          { headers: { "Authorization": `Bearer ${accessToken}` } }
        );
        return data.data?.user?.follower_count ?? 0;
      }
      default: return 0;
    }
  } catch { return 0; }
}

// ─── Main executor ────────────────────────────────────────────────────────────

export async function executePublishJob(jobId: number): Promise<void> {
  const [job] = await db.select().from(publishJobsTable).where(eq(publishJobsTable.id, jobId));
  if (!job) return;
  if (job.status !== "pending") return;

  const [account] = await db.select().from(platformAccountsTable).where(
    job.platformAccountId
      ? eq(platformAccountsTable.id, job.platformAccountId)
      : and(
          eq(platformAccountsTable.userId, job.userId),
          eq(platformAccountsTable.platform, job.platform),
          eq(platformAccountsTable.connected, true)
        )
  );

  if (!account?.accessToken) {
    await db.update(publishJobsTable).set({
      status: "failed",
      errorMessage: `No connected ${job.platform} account found. Connect an account via Settings → Connected Accounts.`,
      errorCode: "auth_failure",
      updatedAt: new Date(),
    }).where(eq(publishJobsTable.id, jobId));
    return;
  }

  if (isTokenExpired(account.tokenExpiresAt)) {
    const refreshed = await tryRefreshToken(account);
    if (!refreshed) {
      await db.update(publishJobsTable).set({
        status: "failed",
        errorMessage: "Access token expired and refresh failed. Please reconnect your account.",
        errorCode: "auth_failure",
        updatedAt: new Date(),
      }).where(eq(publishJobsTable.id, jobId));
      await db.update(platformAccountsTable).set({
        connected: false, errorCode: "auth_failure",
        errorMessage: "Token expired — please reconnect", updatedAt: new Date(),
      }).where(eq(platformAccountsTable.id, account.id));
      return;
    }
  }

  const [freshAccount] = await db.select().from(platformAccountsTable).where(eq(platformAccountsTable.id, account.id));
  const accessToken = decryptToken(freshAccount.accessToken!);

  await db.update(publishJobsTable).set({
    status: "in_progress",
    lastAttemptAt: new Date(),
    attemptCount: (job.attemptCount ?? 0) + 1,
    updatedAt: new Date(),
  }).where(eq(publishJobsTable.id, jobId));

  try {
    let result: PublishResult;
    const userId = freshAccount.platformUserId ?? "";

    switch (job.platform) {
      case "x":
        result = await publishToX(accessToken, job);
        break;
      case "instagram":
        result = await publishToInstagram(accessToken, userId, job);
        break;
      case "facebook":
        result = await publishToFacebook(accessToken, userId, job);
        break;
      case "tiktok":
        result = await publishToTikTok(accessToken, job);
        break;
      default:
        throw Object.assign(new Error(`Unsupported platform: ${job.platform}`), { status: 422 });
    }

    await db.update(publishJobsTable).set({
      status: "published",
      publishedAt: new Date(),
      platformPostId: result.platformPostId ?? null,
      errorMessage: null,
      errorCode: null,
      updatedAt: new Date(),
    }).where(eq(publishJobsTable.id, jobId));

    await db.update(platformAccountsTable).set({
      errorMessage: null, errorCode: null, updatedAt: new Date(),
    }).where(eq(platformAccountsTable.id, freshAccount.id));

  } catch (err: any) {
    const { errorCode, shouldRetry, retryAfterMs } = classifyError(err);
    const newAttemptCount = (job.attemptCount ?? 0) + 1;
    const canRetry = shouldRetry && newAttemptCount < (job.maxAttempts ?? 3);

    await db.update(publishJobsTable).set({
      status: canRetry ? "pending" : "failed",
      errorMessage: err.message ?? "Unknown error",
      errorCode,
      attemptCount: newAttemptCount,
      ...(canRetry && retryAfterMs ? { scheduledAt: new Date(Date.now() + retryAfterMs) } : {}),
      updatedAt: new Date(),
    }).where(eq(publishJobsTable.id, jobId));

    if (errorCode === "auth_failure") {
      await db.update(platformAccountsTable).set({
        connected: false, errorCode, errorMessage: err.message, updatedAt: new Date(),
      }).where(eq(platformAccountsTable.id, freshAccount.id));
    }
  }
}
