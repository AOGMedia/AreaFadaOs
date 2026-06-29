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
