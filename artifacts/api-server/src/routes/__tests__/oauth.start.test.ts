import { test, describe } from "node:test";
import assert from "node:assert/strict";
import esmock from "esmock";

// ─── Mutable state ────────────────────────────────────────────────────────────

const dbState = {
  insertedValues: null as any,
  updatedValues: null as any,
  selectCallIndex: 0,
  selectResults: [] as any[][],
};

// Mutable credential state — tests flip this to simulate missing creds
const credState = { appId: "test_id" as string | null, appSecret: "test_secret" as string | null };

function setDb(results: any[][], creds?: { appId: string | null; appSecret: string | null }) {
  dbState.insertedValues = null;
  dbState.updatedValues = null;
  dbState.selectCallIndex = 0;
  dbState.selectResults = results;
  if (creds !== undefined) {
    credState.appId = creds.appId;
    credState.appSecret = creds.appSecret;
  } else {
    credState.appId = "test_id";
    credState.appSecret = "test_secret";
  }
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
  insert: (_table: any) => ({
    values: (vals: any) => {
      dbState.insertedValues = vals;
      return Promise.resolve([{ id: 99 }]);
    },
  }),
  update: (_table: any) => ({
    set: (vals: any) => {
      dbState.updatedValues = vals;
      return { where: (_cond: any) => Promise.resolve([]) };
    },
  }),
};

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
    fetchFollowerCount: async () => 0,
  },
  "../../lib/logger.ts": {
    logger: { info: () => {}, warn: () => {}, error: () => {} },
  },
  // settings.ts is a direct import of oauth.ts — mock getDbUserCredentials using mutable credState
  "../settings.ts": {
    getDbUserCredentials: async () => ({ appId: credState.appId, appSecret: credState.appSecret }),
  },
})).default;

const express = (await import("express")).default;
const request = (await import("supertest")).default;

function makeApp() {
  const app = express();
  app.use(express.json());
  // Inject clerkUserId, bypassing real Clerk middleware
  app.use((req: any, _res: any, next: any) => { req.clerkUserId = "clerk_test"; next(); });
  // Mount at root — oauth.ts registers routes as "/oauth/:platform/start" (full prefix baked in)
  app.use("/", oauthRouter);
  return app;
}
const app = makeApp();

const defaultUser = [{ id: 42, clerkId: "clerk_test", displayName: "Test Creator" }];

// NOTE: Because settings.ts is fully mocked, getPlatformCreds does NOT hit the DB.
// selectResults order: [0] = getDbUser, [1] = existing account check

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("OAuth start route — /oauth/:platform/start", async () => {
  test("redirects to X OAuth URL containing client_id and PKCE params", async () => {
    setDb([defaultUser, []]);   // user found, no existing account
    const res = await request(app).get("/oauth/x/start");
    assert.equal(res.status, 302, "must redirect");
    const location = res.headers["location"] as string;
    assert.ok(location.includes("twitter.com"), `expected twitter.com, got: ${location}`);
    assert.ok(location.includes("client_id=test_id"), "client_id must be in URL");
    assert.ok(location.includes("code_challenge"), "PKCE code_challenge must be present");
    assert.ok(location.includes("state="), "state param must be present");
  });

  test("redirects to Facebook OAuth URL for Instagram", async () => {
    setDb([defaultUser, []]);
    const res = await request(app).get("/oauth/instagram/start");
    assert.equal(res.status, 302);
    const location = res.headers["location"] as string;
    assert.ok(location.includes("facebook.com"), `expected facebook.com, got: ${location}`);
    assert.ok(location.includes("client_id=test_id"));
    assert.ok(location.includes("state="));
  });

  test("redirects to TikTok OAuth URL", async () => {
    setDb([defaultUser, []]);
    const res = await request(app).get("/oauth/tiktok/start");
    assert.equal(res.status, 302);
    const location = res.headers["location"] as string;
    assert.ok(location.includes("tiktok.com"), `expected tiktok.com, got: ${location}`);
    assert.ok(location.includes("state="));
  });

  test("state blob inserted in DB when no existing account (userId:verifier:state format)", async () => {
    setDb([defaultUser, []]);
    await request(app).get("/oauth/x/start");

    assert.ok(dbState.insertedValues, "db.insert must have been called");
    const inserted = Array.isArray(dbState.insertedValues)
      ? dbState.insertedValues[0]
      : dbState.insertedValues;

    assert.ok(typeof inserted.oauthState === "string", "oauthState must be a string");
    const parts = (inserted.oauthState as string).split(":");
    assert.equal(parts.length, 3, "oauthState must have 3 colon-separated parts: userId:codeVerifier:state");
    assert.equal(parts[0], "42", "first segment must be the numeric userId");
    assert.match(parts[1], /^[0-9a-f]+$/i, "codeVerifier must be hex");
    assert.match(parts[2], /^[0-9a-f]+$/i, "state must be hex");
  });

  test("state blob updated (not inserted) when account already exists", async () => {
    setDb([defaultUser, [{ id: 7 }]]);  // existing account present
    await request(app).get("/oauth/x/start");

    assert.ok(dbState.updatedValues, "db.update must have been called");
    assert.ok(typeof dbState.updatedValues.oauthState === "string");
    const parts = (dbState.updatedValues.oauthState as string).split(":");
    assert.equal(parts.length, 3);
    assert.equal(parts[0], "42");
    assert.equal(dbState.insertedValues, null, "db.insert must NOT be called when account exists");
  });

  test("state hex string is sufficiently long (randomBytes(24) = 48 hex chars)", async () => {
    setDb([defaultUser, []]);
    await request(app).get("/oauth/x/start");

    const inserted = Array.isArray(dbState.insertedValues)
      ? dbState.insertedValues[0]
      : dbState.insertedValues;

    assert.ok(inserted, "db.insert must have been called");
    const statePart = (inserted.oauthState as string).split(":")[2];
    assert.ok(statePart.length >= 24, `state must be ≥24 hex chars (got ${statePart.length})`);
    assert.match(statePart, /^[0-9a-f]+$/i);
  });

  test("returns 302 to settings with missing_credentials when no app credentials exist", async () => {
    setDb([defaultUser, []], { appId: null, appSecret: null });
    const savedId = process.env.X_CLIENT_ID;
    const savedSecret = process.env.X_CLIENT_SECRET;
    delete process.env.X_CLIENT_ID;
    delete process.env.X_CLIENT_SECRET;

    const res = await request(app).get("/oauth/x/start");

    if (savedId !== undefined) process.env.X_CLIENT_ID = savedId;
    if (savedSecret !== undefined) process.env.X_CLIENT_SECRET = savedSecret;

    assert.equal(res.status, 302);
    assert.ok(
      (res.headers["location"] as string).includes("oauth_error=missing_credentials"),
      `expected missing_credentials, got: ${res.headers["location"]}`,
    );
  });

  test("returns 400 for unsupported platform", async () => {
    setDb([defaultUser, []]);
    const res = await request(app).get("/oauth/myspace/start");
    assert.equal(res.status, 400);
    const body = res.body as { error: string };
    assert.ok(
      body.error.toLowerCase().includes("unsupported") || body.error.includes("myspace"),
    );
  });
});
