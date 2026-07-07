/**
 * Integration tests for /admin routes
 *
 * Verifies that requireTier("enterprise") correctly blocks lower-tier users:
 *   1. GET /admin/users → 403 for free, creator, brand, agency users
 *   2. GET /admin/users → 200 for enterprise users (returns user list)
 *   3. PATCH /admin/users/:id/tier → 403 for non-enterprise users
 *   4. PATCH /admin/users/:id/tier → 200 for enterprise users
 *   5. PATCH /admin/users/:id/tier → 403 when enterprise user targets themselves
 *   6. Unauthenticated requests (no clerkUserId) → 401
 *   7. PATCH /admin/promote → 501 when ADMIN_SECRET not configured
 *   8. PATCH /admin/promote → 401 when wrong admin secret is provided
 */

import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import esmock from "esmock";

// ─── Shared mutable state ─────────────────────────────────────────────────────

const TIER_RANK: Record<string, number> = {
  free: 0,
  creator: 1,
  brand: 2,
  agency: 3,
  enterprise: 4,
};

const mockState: {
  clerkUserId: string | null;
  userTier: string;
  selectCallIndex: number;
  selectResults: any[][];
  updates: any[];
} = {
  clerkUserId: "clerk_test_id",
  userTier: "enterprise",
  selectCallIndex: 0,
  selectResults: [],
  updates: [],
};

/**
 * Reset state for a new test.
 * @param tier         - Tier of the requesting user (drives mock tierGuard behavior)
 * @param userId       - Clerk user ID (null → unauthenticated / tierGuard returns 401)
 * @param extraSelects - Select results for the route handler (index 0 onward — tierGuard
 *                       uses its own mock, so ALL selects here go to the route handler)
 */
function resetState(
  tier: string,
  userId: string | null = "clerk_test_id",
  extraSelects: any[][] = [],
) {
  mockState.clerkUserId = userId;
  mockState.userTier = tier;
  mockState.selectCallIndex = 0;
  mockState.selectResults = extraSelects;
  mockState.updates = [];
}

// ─── DB mock ─────────────────────────────────────────────────────────────────

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
    const idx = mockState.selectCallIndex++;
    return buildSelectChain(mockState.selectResults[idx] ?? []);
  },
  update: (_table: any) => ({
    set: (vals: any) => ({
      where: (_cond: any) => ({
        returning: () => {
          const row = { id: 99, email: "target@example.com", tier: vals.tier ?? "creator" };
          mockState.updates.push(row);
          return Promise.resolve([row]);
        },
      }),
    }),
  }),
};

// ─── Load router with mocked deps ─────────────────────────────────────────────
// tierGuard.ts is mocked directly (same pattern as other route tests in this
// project) so it doesn't pull in the real @clerk/express or make real DB calls.
// The mock faithfully reproduces the guard's 401 / 403 / next() behavior using
// the same tier-rank comparison logic, driven by mockState.

const adminRouter = (
  await esmock("../admin.ts", {
    "@workspace/db": {
      db: mockDb,
      usersTable: Symbol("usersTable"),
    },
    "../../middlewares/tierGuard.ts": {
      requireTier: (minimumTier: string) => (req: any, res: any, next: any) => {
        if (!mockState.clerkUserId) {
          res.status(401).json({ error: "Unauthorized" });
          return;
        }
        const userRank = TIER_RANK[mockState.userTier] ?? 0;
        const requiredRank = TIER_RANK[minimumTier] ?? 0;
        if (userRank < requiredRank) {
          res.status(403).json({
            error: "Upgrade required",
            requiredTier: minimumTier,
            currentTier: mockState.userTier,
            upgradeUrl: "/sign-up",
          });
          return;
        }
        req.clerkUserId = mockState.clerkUserId;
        req.userTier = mockState.userTier;
        next();
      },
    },
  })
).default;

const express = (await import("express")).default;
const request = (await import("supertest")).default;

function makeApp() {
  const app = express();
  app.use(express.json());
  // admin.ts bakes full paths ("/admin/users"), so mount at root
  app.use("/", adminRouter);
  return app;
}

const app = makeApp();

// ─── Restore ADMIN_SECRET env var after all tests ─────────────────────────────

const originalAdminSecret = process.env.ADMIN_SECRET;
after(() => {
  if (originalAdminSecret === undefined) {
    delete process.env.ADMIN_SECRET;
  } else {
    process.env.ADMIN_SECRET = originalAdminSecret;
  }
});

// ─── GET /admin/users ─────────────────────────────────────────────────────────

describe("GET /admin/users — tier guard enforcement", async () => {
  const nonEnterpriseTiers = ["free", "creator", "brand", "agency"] as const;

  for (const tier of nonEnterpriseTiers) {
    test(`${tier} user → 403 Forbidden`, async () => {
      resetState(tier);
      const res = await request(app).get("/admin/users");
      assert.equal(
        res.status,
        403,
        `expected 403 for ${tier} user, got ${res.status}: ${JSON.stringify(res.body)}`,
      );
      const body = res.body as { error: string; requiredTier: string; currentTier: string };
      assert.equal(body.requiredTier, "enterprise");
      assert.equal(body.currentTier, tier);
    });
  }

  test("enterprise user → 200 with user list", async () => {
    const fakeUsers = [
      {
        id: 1,
        clerkId: "clerk_test_id",
        email: "admin@example.com",
        displayName: "Admin",
        tier: "enterprise",
        createdAt: new Date().toISOString(),
      },
    ];
    // select[0] → route handler's user list (tierGuard uses its own mock, no DB call)
    resetState("enterprise", "clerk_test_id", [fakeUsers]);

    const res = await request(app).get("/admin/users");
    assert.equal(
      res.status,
      200,
      `expected 200 for enterprise user, got ${res.status}: ${JSON.stringify(res.body)}`,
    );
    const body = res.body as { users: any[] };
    assert.ok(Array.isArray(body.users), "response must have a users array");
    assert.equal(body.users.length, 1);
    assert.equal(body.users[0].email, "admin@example.com");
  });

  test("unauthenticated request (no Clerk session) → 401", async () => {
    resetState("enterprise", null);
    const res = await request(app).get("/admin/users");
    assert.equal(
      res.status,
      401,
      `expected 401 for unauthenticated request, got ${res.status}: ${JSON.stringify(res.body)}`,
    );
  });
});

// ─── PATCH /admin/users/:id/tier ──────────────────────────────────────────────

describe("PATCH /admin/users/:id/tier — tier guard enforcement", async () => {
  const nonEnterpriseTiers = ["free", "creator", "brand", "agency"] as const;

  for (const tier of nonEnterpriseTiers) {
    test(`${tier} user → 403 Forbidden`, async () => {
      resetState(tier);
      const res = await request(app)
        .patch("/admin/users/42/tier")
        .send({ tier: "creator" });
      assert.equal(
        res.status,
        403,
        `expected 403 for ${tier} user, got ${res.status}: ${JSON.stringify(res.body)}`,
      );
      const body = res.body as { error: string; requiredTier: string };
      assert.equal(body.requiredTier, "enterprise");
    });
  }

  test("enterprise user → 200 when updating another user's tier", async () => {
    // select[0] = self-check (id=1, target is 42 → different → allowed)
    resetState("enterprise", "clerk_test_id", [[{ id: 1 }]]);

    const res = await request(app)
      .patch("/admin/users/42/tier")
      .send({ tier: "brand" });
    assert.equal(
      res.status,
      200,
      `expected 200 for enterprise user updating another, got ${res.status}: ${JSON.stringify(res.body)}`,
    );
    const body = res.body as { user: { id: number; tier: string } };
    assert.ok(body.user, "response must have a user object");
    assert.equal(body.user.tier, "brand");
    assert.equal(mockState.updates.length, 1, "one DB update must fire");
  });

  test("enterprise user trying to update their own tier → 403", async () => {
    // self-check returns id=42 (same as the target) → route returns 403
    resetState("enterprise", "clerk_test_id", [[{ id: 42 }]]);

    const res = await request(app)
      .patch("/admin/users/42/tier")
      .send({ tier: "creator" });
    assert.equal(
      res.status,
      403,
      `expected 403 when enterprise user targets themselves, got ${res.status}: ${JSON.stringify(res.body)}`,
    );
    assert.match(res.body.error as string, /cannot change your own tier/i);
  });

  test("enterprise user with invalid tier value → 400", async () => {
    resetState("enterprise", "clerk_test_id", [[{ id: 1 }]]);

    const res = await request(app)
      .patch("/admin/users/42/tier")
      .send({ tier: "superadmin" });
    assert.equal(
      res.status,
      400,
      `expected 400 for invalid tier value, got ${res.status}: ${JSON.stringify(res.body)}`,
    );
  });

  test("unauthenticated request (no Clerk session) → 401", async () => {
    resetState("enterprise", null);
    const res = await request(app)
      .patch("/admin/users/42/tier")
      .send({ tier: "creator" });
    assert.equal(res.status, 401);
  });
});

// ─── PATCH /admin/promote ─────────────────────────────────────────────────────

describe("PATCH /admin/promote — admin-secret guard (no tier guard)", async () => {
  test("returns 501 when ADMIN_SECRET env var is not set", async () => {
    delete process.env.ADMIN_SECRET;

    const res = await request(app)
      .patch("/admin/promote")
      .send({ email: "someone@example.com", tier: "enterprise" });
    assert.equal(
      res.status,
      501,
      `expected 501 when ADMIN_SECRET not configured, got ${res.status}`,
    );
  });

  test("returns 401 when wrong admin secret is provided", async () => {
    process.env.ADMIN_SECRET = "real-secret-value";

    const res = await request(app)
      .patch("/admin/promote")
      .set("x-admin-secret", "wrong-secret")
      .send({ email: "someone@example.com", tier: "enterprise" });
    assert.equal(res.status, 401);

    delete process.env.ADMIN_SECRET;
  });
});
