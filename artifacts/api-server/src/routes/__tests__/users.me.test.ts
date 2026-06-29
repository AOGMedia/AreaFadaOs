/**
 * Integration tests for GET /users/me and GET /users/me/tier
 *
 * Verifies the enterprise-tier assignment end-to-end:
 *   1. New user whose email IS in JWT session claims → tier: "enterprise"
 *   2. New user whose email is NOT in JWT claims, Clerk API fallback → tier: "enterprise"
 *   3. New user with a non-enterprise email → tier: "creator"
 *   4. Existing user with placeholder email is healed via JWT email → upgraded to "enterprise"
 *   5. Existing user already on "enterprise" → stays "enterprise" without an extra DB update
 *   6. /users/me/tier returns full tier metadata for an enterprise user
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import esmock from "esmock";

// ─── Shared mutable state ─────────────────────────────────────────────────────

/** Simulates what @clerk/express getAuth() returns for the current request. */
const clerkAuth: {
  userId: string | null;
  sessionClaims: Record<string, unknown>;
} = { userId: "clerk_test_id", sessionClaims: {} };

/** Controls what global fetch returns when fetchEmailFromClerk is called. */
let mockFetchResponse: unknown = null;

/** Tracks all DB operations performed during a test. */
const dbOps: {
  selects: any[][];
  selectCallIndex: number;
  inserts: any[];
  updates: any[];
} = { selects: [], selectCallIndex: 0, inserts: [], updates: [] };

function resetState(
  selects: any[][],
  auth: { userId?: string; email?: string },
  fetchResp: unknown = null,
) {
  dbOps.selects = selects;
  dbOps.selectCallIndex = 0;
  dbOps.inserts = [];
  dbOps.updates = [];

  clerkAuth.userId = auth.userId ?? "clerk_test_id";
  clerkAuth.sessionClaims = auth.email ? { email: auth.email } : {};

  mockFetchResponse = fetchResp;
}

// ─── DB mock helpers ──────────────────────────────────────────────────────────

function buildSelectChain(data: any[]) {
  const p = Promise.resolve(data);
  const chain: any = {
    from: () => chain,
    where: () => chain,
    limit: () => chain,
    then: p.then.bind(p),
    catch: p.catch.bind(p),
    finally: p.finally.bind(p),
  };
  return chain;
}

const mockDb: any = {
  select: (_fields?: any) => {
    const idx = dbOps.selectCallIndex++;
    return buildSelectChain(dbOps.selects[idx] ?? []);
  },
  insert: (_table: any) => ({
    values: (vals: any) => ({
      returning: () => {
        const row = { id: 1, clerkId: vals.clerkId, email: vals.email, tier: vals.tier, displayName: vals.displayName, avatarUrl: null, bio: null, country: null, createdAt: new Date() };
        dbOps.inserts.push(row);
        return Promise.resolve([row]);
      },
    }),
  }),
  update: (_table: any) => ({
    set: (vals: any) => ({
      where: (_cond: any) => ({
        returning: () => {
          const row = { id: 1, clerkId: clerkAuth.userId, ...vals, avatarUrl: null, bio: null, country: null, createdAt: new Date() };
          dbOps.updates.push(row);
          return Promise.resolve([row]);
        },
      }),
    }),
  }),
};

// ─── Load the router with all deps mocked ─────────────────────────────────────

const usersRouter = (await esmock("../users.ts", {
  "@workspace/db": {
    db: mockDb,
    usersTable: Symbol("usersTable"),
  },
  "@clerk/express": {
    getAuth: (_req: any) => ({
      userId: clerkAuth.userId,
      sessionClaims: { userId: clerkAuth.userId, ...clerkAuth.sessionClaims },
    }),
  },
})).default;

// Patch global fetch AFTER esmock loads the module (module-level fetch is captured by closure at call-time).
// We replace it before each request by assigning to globalThis.fetch.
const realFetch = globalThis.fetch;

const express = (await import("express")).default;
const request = (await import("supertest")).default;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use("/", usersRouter);
  return app;
}
const app = makeApp();

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("GET /users/me — enterprise tier assignment", async () => {

  test("new user with enterprise email in JWT claims → tier: enterprise", async () => {
    resetState(
      [[]], // no existing user → insert will be called
      { email: "osejialexander77@gmail.com" },
    );

    const res = await request(app).get("/users/me");
    assert.equal(res.status, 200, `unexpected status: ${JSON.stringify(res.body)}`);

    const body = res.body as { tier: string; email: string };
    assert.equal(body.tier, "enterprise", `expected enterprise, got: ${body.tier}`);
    assert.equal(body.email, "osejialexander77@gmail.com");

    assert.equal(dbOps.inserts.length, 1, "a new user row must be inserted");
    assert.equal(dbOps.inserts[0].tier, "enterprise");
  });

  test("new user with no email in JWT claims, Clerk API returns enterprise email → tier: enterprise", async () => {
    // Simulate Clerk API returning the enterprise email
    const clerkApiPayload = {
      primary_email_address_id: "ea_abc",
      email_addresses: [{ id: "ea_abc", email_address: "osejialexander77@gmail.com" }],
    };

    // Patch global fetch to simulate the Clerk Backend API
    (globalThis as any).fetch = async (url: string, _opts?: any) => {
      if (typeof url === "string" && url.includes("api.clerk.com")) {
        return { ok: true, json: async () => clerkApiPayload } as Response;
      }
      return realFetch(url, _opts);
    };

    resetState(
      [[]], // no existing user
      { email: undefined }, // no email in JWT
    );
    // After insert (with placeholder), the existing record has placeholder email
    // insert will return placeholder; then heal path fires via fetch fallback
    // We need to simulate: select returns [] (no user), insert returns placeholder,
    // then update (heal) is called, then update (upgrade) is called.
    // But mockDb.insert already stores the row — after insert the row has placeholder email.
    // The heal path checks user.email.endsWith("@areafadaos.app") — yes for placeholder.

    const res = await request(app).get("/users/me");
    (globalThis as any).fetch = realFetch; // restore

    assert.equal(res.status, 200, `unexpected status: ${JSON.stringify(res.body)}`);
    const body = res.body as { tier: string; email: string };
    assert.equal(body.tier, "enterprise", `expected enterprise via Clerk API fallback, got: ${body.tier}`);
  });

  test("new user with non-enterprise email → tier: creator", async () => {
    resetState(
      [[]],
      { email: "random.creator@example.com" },
    );

    const res = await request(app).get("/users/me");
    assert.equal(res.status, 200);

    const body = res.body as { tier: string };
    assert.equal(body.tier, "creator", `expected creator, got: ${body.tier}`);
    assert.equal(dbOps.inserts.length, 1);
    assert.equal(dbOps.inserts[0].tier, "creator");
  });

  test("existing user with placeholder email → healed via JWT email → upgraded to enterprise", async () => {
    const placeholderUser = {
      id: 5,
      clerkId: "clerk_test_id",
      email: "clerk_test_id@areafadaos.app",
      tier: "creator",
      displayName: "Area Fada",
      avatarUrl: null,
      bio: null,
      country: null,
      createdAt: new Date(),
    };

    resetState(
      [[placeholderUser]], // existing user returned by select
      { email: "osejialexander77@gmail.com" },
    );

    const res = await request(app).get("/users/me");
    assert.equal(res.status, 200, `unexpected status: ${JSON.stringify(res.body)}`);

    const body = res.body as { tier: string; email: string };
    assert.equal(body.tier, "enterprise", `expected enterprise after heal+upgrade, got: ${body.tier}`);

    // Two updates: first heal email, then upgrade tier
    assert.ok(dbOps.updates.length >= 1, "at least one DB update expected (heal email)");
    const emailHeal = dbOps.updates.find((u: any) => u.email === "osejialexander77@gmail.com");
    assert.ok(emailHeal, "email heal update must set the real email");
  });

  test("existing user already on enterprise → response is enterprise (no upgrade update)", async () => {
    const enterpriseUser = {
      id: 1,
      clerkId: "clerk_test_id",
      email: "osejialexander77@gmail.com",
      tier: "enterprise",
      displayName: "Alex",
      avatarUrl: null,
      bio: null,
      country: null,
      createdAt: new Date(),
    };

    resetState(
      [[enterpriseUser]],
      { email: "osejialexander77@gmail.com" },
    );

    const res = await request(app).get("/users/me");
    assert.equal(res.status, 200);

    const body = res.body as { tier: string };
    assert.equal(body.tier, "enterprise");
    // No updates needed — email is real and tier is already enterprise
    assert.equal(dbOps.updates.length, 0, "no DB updates should fire when user is already correct");
    assert.equal(dbOps.inserts.length, 0, "no insert should fire for existing user");
  });

  test("unauthenticated request → 401", async () => {
    const savedUserId = clerkAuth.userId;
    clerkAuth.userId = null;

    const res = await request(app).get("/users/me");
    clerkAuth.userId = savedUserId;

    assert.equal(res.status, 401);
  });
});

describe("GET /users/me/tier — enterprise tier metadata", async () => {

  test("enterprise user gets full tier metadata with all modules enabled", async () => {
    const enterpriseUser = {
      id: 1,
      clerkId: "clerk_test_id",
      email: "osejialexander77@gmail.com",
      tier: "enterprise",
      displayName: "Alex",
      avatarUrl: null,
      bio: null,
      country: null,
      createdAt: new Date(),
    };

    resetState([[enterpriseUser]], { email: "osejialexander77@gmail.com" });

    const res = await request(app).get("/users/me/tier");
    assert.equal(res.status, 200, `unexpected status: ${JSON.stringify(res.body)}`);

    const body = res.body as {
      tier: string;
      tierName: string;
      monthlyPrice: null;
      moduleAccess: Record<string, boolean>;
    };

    assert.equal(body.tier, "enterprise");
    assert.equal(body.tierName, "Enterprise");
    assert.equal(body.monthlyPrice, null);

    const modules = body.moduleAccess;
    const allModules = [
      "scheduling", "monetization", "analytics", "ambassadorCrm",
      "bookPromo", "liveVideo", "clipEngine", "autoPost",
      "trafficTools", "fanHub", "campaignIntelligence",
    ];
    for (const mod of allModules) {
      assert.equal(modules[mod], true, `module "${mod}" must be enabled for enterprise`);
    }
  });

  test("creator user gets restricted module access (no ambassadorCrm, fanHub, campaignIntelligence)", async () => {
    const creatorUser = {
      id: 2,
      clerkId: "clerk_test_id",
      email: "creator@example.com",
      tier: "creator",
      displayName: "Creator",
      avatarUrl: null,
      bio: null,
      country: null,
      createdAt: new Date(),
    };

    resetState([[creatorUser]], { email: "creator@example.com" });

    const res = await request(app).get("/users/me/tier");
    assert.equal(res.status, 200);

    const body = res.body as { tier: string; moduleAccess: Record<string, boolean> };
    assert.equal(body.tier, "creator");
    assert.equal(body.moduleAccess.ambassadorCrm, false);
    assert.equal(body.moduleAccess.fanHub, false);
    assert.equal(body.moduleAccess.campaignIntelligence, false);
    assert.equal(body.moduleAccess.scheduling, true);
    assert.equal(body.moduleAccess.monetization, true);
  });
});
