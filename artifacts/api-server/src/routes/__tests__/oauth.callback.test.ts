import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import esmock from "esmock";

// ─── Shared test constants ─────────────────────────────────────────────────────

const TEST_STATE = "abc123teststate456789abcdef123456";
const TEST_CODE_VERIFIER = "abcdef1234567890abcdef1234567890abcdef12";
const TEST_USER_ID = 42;
const TEST_OAUTH_STATE_BLOB = `${TEST_USER_ID}:${TEST_CODE_VERIFIER}:${TEST_STATE}`;

// ─── Mutable DB state ──────────────────────────────────────────────────────────

const dbState = {
  updatedValues: null as any,
  selectCallIndex: 0,
  selectResults: [] as any[][],
};

function resetDb(selectResults: any[][]) {
  dbState.updatedValues = null;
  dbState.selectCallIndex = 0;
  dbState.selectResults = selectResults;
}

function buildSelectChain(data: any[]) {
  const p = Promise.resolve(data);
  const chain: any = {
    from: () => chain,
    where: () => chain,
    limit: () => chain,
    orderBy: () => chain,
    then: p.then.bind(p),
    catch: p.catch.bind(p),
    finally: p.finally.bind(p),
  };
  return chain;
}

const mockDb: any = {
  select: (_fields?: any) => {
    const idx = dbState.selectCallIndex++;
    return buildSelectChain(dbState.selectResults[idx] ?? []);
  },
  update: (_table: any) => ({
    set: (vals: any) => {
      dbState.updatedValues = vals;
      return { where: (_cond: any) => Promise.resolve([]) };
    },
  }),
};

// ─── Mutable encrypt state ─────────────────────────────────────────────────────

const encryptState = { calls: [] as string[] };

function resetEncrypt() {
  encryptState.calls = [];
}

// ─── Load the router with all deps mocked ─────────────────────────────────────

const oauthRouter = (await esmock("../oauth.ts", {
  "@workspace/db": {
    db: mockDb,
    usersTable: Symbol("usersTable"),
    platformAccountsTable: Symbol("platformAccountsTable"),
    platformOauthConfigsTable: Symbol("platformOauthConfigsTable"),
  },
  "@clerk/express": {
    getAuth: (_req: any) => ({ userId: "clerk_test" }),
    clerkMiddleware: () => (_req: any, _res: any, next: any) => next(),
  },
  "../../lib/platformPublisher.ts": {
    executePublishJob: async () => {},
    fetchFollowerCount: async () => 1000,
  },
  "../../lib/logger.ts": {
    logger: { info: () => {}, warn: () => {}, error: () => {} },
  },
  "../../lib/tokenEncryption.ts": {
    encryptToken: (plaintext: string) => {
      encryptState.calls.push(plaintext);
      return `enc:${plaintext}`;
    },
    decryptToken: (enc: string) => enc.replace(/^enc:/, ""),
    isTokenExpired: () => false,
  },
  "../settings.ts": {
    getDbUserCredentials: async () => ({ appId: "test_id", appSecret: "test_secret" }),
  },
})).default;

const express = (await import("express")).default;
const request = (await import("supertest")).default;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res: any, next: any) => { req.clerkUserId = "clerk_test"; next(); });
  app.use("/", oauthRouter);
  return app;
}
const app = makeApp();

// ─── fetch mock helper ─────────────────────────────────────────────────────────

type FakeResp = { ok: boolean; json: object };

function makeFetchMock(...responses: FakeResp[]) {
  let i = 0;
  return async (_url: string, _opts?: any): Promise<{ ok: boolean; json: () => Promise<object> }> => {
    const resp = responses[i] ?? responses[responses.length - 1];
    i++;
    return { ok: resp.ok, json: async () => resp.json };
  };
}

// ─── Account fixtures ──────────────────────────────────────────────────────────

const xAccount = {
  id: 7,
  userId: TEST_USER_ID,
  platform: "x",
  oauthState: TEST_OAUTH_STATE_BLOB,
};

const igAccount = {
  id: 8,
  userId: TEST_USER_ID,
  platform: "instagram",
  oauthState: TEST_OAUTH_STATE_BLOB,
};

const ttAccount = {
  id: 9,
  userId: TEST_USER_ID,
  platform: "tiktok",
  oauthState: TEST_OAUTH_STATE_BLOB,
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("OAuth callback route — /oauth/:platform/callback", async () => {
  let savedFetch: typeof globalThis.fetch;

  before(() => { savedFetch = globalThis.fetch; });
  after(() => { globalThis.fetch = savedFetch; });
  beforeEach(() => { resetEncrypt(); });

  test("valid code+state pair — updates DB with encrypted token and redirects with oauth_success", async () => {
    resetDb([[xAccount]]);
    globalThis.fetch = makeFetchMock(
      { ok: true, json: { access_token: "raw_access_token", refresh_token: "raw_refresh", expires_in: 7200, scope: "tweet.read tweet.write" } },
      { ok: true, json: { data: { id: "x_uid_123", username: "testcreator", name: "Test Creator" } } },
    ) as any;

    const res = await request(app).get(`/oauth/x/callback?code=valid_code&state=${TEST_STATE}`);

    assert.equal(res.status, 302, "must redirect");
    assert.ok(
      (res.headers["location"] as string).includes("oauth_success=x"),
      `expected oauth_success=x, got: ${res.headers["location"]}`,
    );

    assert.ok(dbState.updatedValues, "db.update must have been called");
    assert.equal(dbState.updatedValues.connected, true, "connected must be set to true");
    assert.ok(
      typeof dbState.updatedValues.accessToken === "string" && dbState.updatedValues.accessToken.length > 0,
      "accessToken must be written to DB",
    );
    assert.notEqual(
      dbState.updatedValues.accessToken,
      "raw_access_token",
      "plain access token must NEVER be stored in the DB",
    );
    assert.equal(
      dbState.updatedValues.accessToken,
      "enc:raw_access_token",
      "accessToken stored must be the encrypted value",
    );
  });

  test("encryptToken is called with the raw token before saving — never stores plain text", async () => {
    resetDb([[xAccount]]);
    globalThis.fetch = makeFetchMock(
      { ok: true, json: { access_token: "super_secret_raw", refresh_token: null, expires_in: 0, scope: "" } },
      { ok: true, json: { data: { id: "uid", username: "user", name: "User" } } },
    ) as any;

    await request(app).get(`/oauth/x/callback?code=c&state=${TEST_STATE}`);

    assert.ok(
      encryptState.calls.includes("super_secret_raw"),
      `encryptToken must be called with the raw access token; calls were: ${JSON.stringify(encryptState.calls)}`,
    );
    assert.notEqual(
      dbState.updatedValues?.accessToken,
      "super_secret_raw",
      "plain access token must not be written to DB",
    );
  });

  test("invalid state — redirects with oauth_error=invalid_state", async () => {
    resetDb([[xAccount]]);

    const res = await request(app).get("/oauth/x/callback?code=some_code&state=completely_wrong_state");

    assert.equal(res.status, 302);
    assert.ok(
      (res.headers["location"] as string).includes("oauth_error=invalid_state"),
      `expected oauth_error=invalid_state, got: ${res.headers["location"]}`,
    );
  });

  test("failed token exchange — redirects with the error message from the API", async () => {
    resetDb([[xAccount]]);
    globalThis.fetch = makeFetchMock(
      { ok: false, json: { error: "invalid_grant", error_description: "Authorization code has expired" } },
    ) as any;

    const res = await request(app).get(`/oauth/x/callback?code=stale_code&state=${TEST_STATE}`);

    assert.equal(res.status, 302);
    const location = res.headers["location"] as string;
    assert.ok(location.includes("oauth_error="), `expected oauth_error query param, got: ${location}`);
    assert.ok(
      decodeURIComponent(location).includes("Authorization code has expired"),
      `expected the API error message in the redirect, got: ${location}`,
    );
  });

  test("oauth provider sends error param — redirects immediately with that error", async () => {
    resetDb([]);

    const res = await request(app).get("/oauth/x/callback?error=access_denied&state=whatever");

    assert.equal(res.status, 302);
    assert.ok(
      (res.headers["location"] as string).includes("oauth_error=access_denied"),
      `expected oauth_error=access_denied, got: ${res.headers["location"]}`,
    );
  });

  test("missing code param — redirects with oauth_error=missing_code", async () => {
    resetDb([]);

    const res = await request(app).get("/oauth/x/callback?state=someval");

    assert.equal(res.status, 302);
    assert.ok(
      (res.headers["location"] as string).includes("oauth_error=missing_code"),
      `expected oauth_error=missing_code, got: ${res.headers["location"]}`,
    );
  });
});

// ─── Instagram callback tests ─────────────────────────────────────────────────

describe("OAuth callback route — Instagram", async () => {
  let savedFetch: typeof globalThis.fetch;

  before(() => { savedFetch = globalThis.fetch; });
  after(() => { globalThis.fetch = savedFetch; });
  beforeEach(() => { resetEncrypt(); });

  test("full success: short-lived → long-lived token, business account found — updates DB and redirects with oauth_success", async () => {
    resetDb([[igAccount]]);
    globalThis.fetch = makeFetchMock(
      // Step 1: short-lived token exchange
      { ok: true, json: { access_token: "ig_short_lived_token" } },
      // Step 2: long-lived token exchange
      { ok: true, json: { access_token: "ig_long_lived_token", expires_in: 5184000 } },
      // Step 3: pages/accounts — page with Instagram Business Account
      {
        ok: true,
        json: {
          data: [
            {
              id: "page_123",
              access_token: "ig_page_token",
              instagram_business_account: { id: "ig_biz_456" },
            },
          ],
        },
      },
      // Step 4: me info for the business account
      { ok: true, json: { username: "test_ig_creator", followers_count: 5000 } },
    ) as any;

    const res = await request(app).get(`/oauth/instagram/callback?code=ig_auth_code&state=${TEST_STATE}`);

    assert.equal(res.status, 302, "must redirect");
    assert.ok(
      (res.headers["location"] as string).includes("oauth_success=instagram"),
      `expected oauth_success=instagram, got: ${res.headers["location"]}`,
    );

    assert.ok(dbState.updatedValues, "db.update must have been called");
    assert.equal(dbState.updatedValues.connected, true, "connected must be set to true");
    assert.ok(
      typeof dbState.updatedValues.accessToken === "string" && dbState.updatedValues.accessToken.length > 0,
      "accessToken must be written to DB",
    );
    assert.equal(
      dbState.updatedValues.accessToken,
      "enc:ig_page_token",
      "DB must store the encrypted page access token",
    );
    assert.notEqual(
      dbState.updatedValues.accessToken,
      "ig_page_token",
      "plain page access token must never be stored in DB",
    );
    assert.equal(
      dbState.updatedValues.refreshToken,
      "enc:ig_long_lived_token",
      "DB must store the encrypted long-lived user token as refreshToken",
    );
  });

  test("encryptToken is called with the raw page token — never stores plain text", async () => {
    resetDb([[igAccount]]);
    globalThis.fetch = makeFetchMock(
      { ok: true, json: { access_token: "raw_short_token" } },
      { ok: true, json: { access_token: "raw_long_token", expires_in: 5184000 } },
      {
        ok: true,
        json: {
          data: [
            {
              id: "page_abc",
              access_token: "raw_page_access_token",
              instagram_business_account: { id: "ig_biz_789" },
            },
          ],
        },
      },
      { ok: true, json: { username: "creator_handle" } },
    ) as any;

    await request(app).get(`/oauth/instagram/callback?code=c&state=${TEST_STATE}`);

    assert.ok(
      encryptState.calls.includes("raw_page_access_token"),
      `encryptToken must be called with the raw page access token; calls were: ${JSON.stringify(encryptState.calls)}`,
    );
    assert.notEqual(
      dbState.updatedValues?.accessToken,
      "raw_page_access_token",
      "plain page access token must not be written to DB",
    );
  });

  test("short-lived token exchange fails — redirects with oauth_error", async () => {
    resetDb([[igAccount]]);
    globalThis.fetch = makeFetchMock(
      { ok: false, json: { error: { message: "Invalid OAuth access code" } } },
    ) as any;

    const res = await request(app).get(`/oauth/instagram/callback?code=bad_code&state=${TEST_STATE}`);

    assert.equal(res.status, 302);
    const location = res.headers["location"] as string;
    assert.ok(location.includes("oauth_error="), `expected oauth_error param, got: ${location}`);
    assert.ok(
      decodeURIComponent(location).includes("Invalid OAuth access code"),
      `expected the API error message in the redirect, got: ${location}`,
    );
  });

  test("no Instagram Business Account found — redirects with oauth_error", async () => {
    resetDb([[igAccount]]);
    globalThis.fetch = makeFetchMock(
      // Step 1: short-lived token succeeds
      { ok: true, json: { access_token: "ig_short_token" } },
      // Step 2: long-lived token succeeds
      { ok: true, json: { access_token: "ig_long_token", expires_in: 5184000 } },
      // Step 3: pages list — no page has an instagram_business_account
      { ok: true, json: { data: [{ id: "page_no_ig", access_token: "page_tok" }] } },
    ) as any;

    const res = await request(app).get(`/oauth/instagram/callback?code=ok_code&state=${TEST_STATE}`);

    assert.equal(res.status, 302);
    const location = res.headers["location"] as string;
    assert.ok(location.includes("oauth_error="), `expected oauth_error param, got: ${location}`);
    assert.ok(
      decodeURIComponent(location).includes("No Instagram Business Account"),
      `expected "No Instagram Business Account" in redirect, got: ${location}`,
    );
  });
});

// ─── TikTok callback tests ────────────────────────────────────────────────────

describe("OAuth callback route — TikTok", async () => {
  let savedFetch: typeof globalThis.fetch;

  before(() => { savedFetch = globalThis.fetch; });
  after(() => { globalThis.fetch = savedFetch; });
  beforeEach(() => { resetEncrypt(); });

  test("token exchange success — updates DB with encrypted token and redirects with oauth_success", async () => {
    resetDb([[ttAccount]]);
    globalThis.fetch = makeFetchMock(
      // Step 1: token exchange
      {
        ok: true,
        json: {
          access_token: "tt_raw_access_token",
          refresh_token: "tt_raw_refresh_token",
          expires_in: 86400,
          scope: "user.info.basic,video.list",
          open_id: "tt_open_id_123",
        },
      },
      // Step 2: user info
      {
        ok: true,
        json: {
          data: {
            user: { username: "tt_creator", display_name: "TikTok Creator" },
          },
        },
      },
    ) as any;

    const res = await request(app).get(`/oauth/tiktok/callback?code=tt_auth_code&state=${TEST_STATE}`);

    assert.equal(res.status, 302, "must redirect");
    assert.ok(
      (res.headers["location"] as string).includes("oauth_success=tiktok"),
      `expected oauth_success=tiktok, got: ${res.headers["location"]}`,
    );

    assert.ok(dbState.updatedValues, "db.update must have been called");
    assert.equal(dbState.updatedValues.connected, true, "connected must be set to true");
    assert.equal(
      dbState.updatedValues.accessToken,
      "enc:tt_raw_access_token",
      "DB must store the encrypted access token",
    );
    assert.notEqual(
      dbState.updatedValues.accessToken,
      "tt_raw_access_token",
      "plain TikTok access token must never be stored in DB",
    );
    assert.ok(
      encryptState.calls.includes("tt_raw_access_token"),
      `encryptToken must be called with the raw TikTok access token; calls were: ${JSON.stringify(encryptState.calls)}`,
    );
  });

  test("token exchange failure — redirects with the error description from the API", async () => {
    resetDb([[ttAccount]]);
    globalThis.fetch = makeFetchMock(
      { ok: false, json: { error_description: "Authorization code has expired or been used" } },
    ) as any;

    const res = await request(app).get(`/oauth/tiktok/callback?code=stale_tt_code&state=${TEST_STATE}`);

    assert.equal(res.status, 302);
    const location = res.headers["location"] as string;
    assert.ok(location.includes("oauth_error="), `expected oauth_error param, got: ${location}`);
    assert.ok(
      decodeURIComponent(location).includes("Authorization code has expired or been used"),
      `expected the TikTok error description in the redirect, got: ${location}`,
    );
  });
});
