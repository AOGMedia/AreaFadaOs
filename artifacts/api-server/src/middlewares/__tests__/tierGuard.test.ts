/**
 * Security tests for tierGuard.ts
 *
 * Core invariant under test: tier is ALWAYS read from the database.
 * A JWT with forged sessionClaims (e.g. tier = "enterprise") cannot
 * bypass the guard — the DB lookup governs the decision.
 *
 * Test scenarios:
 *   1. Forged JWT claim (sessionClaims.tier = "enterprise") + DB tier = "free" → 403
 *   2. Forged JWT claim (sessionClaims.tier = "enterprise") + DB tier = "creator" → 403
 *   3. Legitimate enterprise user in DB → next() called (guard passes)
 *   4. No Clerk user ID (unauthenticated) → 401
 *   5. User not found in DB → 401
 *   6. Lower-tier users are blocked at each tier boundary
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import esmock from "esmock";

// ─── Shared mock state ────────────────────────────────────────────────────────

const mockState: {
  clerkUserId: string | null;
  sessionClaimsExtra: Record<string, unknown>;
  dbRows: { tier: string }[];
} = {
  clerkUserId: "clerk_user_abc",
  sessionClaimsExtra: {},
  dbRows: [{ tier: "free" }],
};

function resetState(opts: {
  clerkUserId?: string | null;
  sessionClaimsExtra?: Record<string, unknown>;
  dbRows?: { tier: string }[];
}) {
  mockState.clerkUserId = opts.clerkUserId === undefined ? "clerk_user_abc" : opts.clerkUserId;
  mockState.sessionClaimsExtra = opts.sessionClaimsExtra ?? {};
  mockState.dbRows = opts.dbRows ?? [{ tier: "free" }];
}

// ─── Mock @clerk/express ──────────────────────────────────────────────────────
// getAuth returns a session with userId set, plus any extra sessionClaims
// the test wants to inject (simulating a forged JWT payload).

const mockGetAuth = (_req: unknown) => {
  if (!mockState.clerkUserId) return { userId: null, sessionClaims: null };
  return {
    userId: mockState.clerkUserId,
    sessionClaims: {
      userId: mockState.clerkUserId,
      ...mockState.sessionClaimsExtra,
    },
  };
};

// ─── Mock @workspace/db ───────────────────────────────────────────────────────

function buildSelectChain(rows: unknown[]) {
  const p = Promise.resolve(rows);
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
  select: (_fields?: unknown) => buildSelectChain(mockState.dbRows),
};

// ─── Load real tierGuard with mocked deps ─────────────────────────────────────
// We load the REAL tierGuard.ts (not a stub) so we exercise its actual logic.
// Only the external I/O surfaces are mocked: Clerk's getAuth and the DB driver.

const { requireTier } = await esmock("../tierGuard.ts", {
  "@clerk/express": { getAuth: mockGetAuth },
  "@workspace/db": {
    db: mockDb,
    usersTable: Symbol("usersTable"),
  },
  "drizzle-orm": { eq: () => true },
});

// ─── Helper: invoke middleware and collect result ─────────────────────────────

interface MiddlewareResult {
  status: number | undefined;
  body: unknown;
  calledNext: boolean;
  req: Record<string, unknown>;
}

function invokeMiddleware(middleware: any): Promise<MiddlewareResult> {
  return new Promise((resolve) => {
    const req: Record<string, unknown> = {};
    let status: number | undefined;
    let body: unknown;

    const res: any = {
      status(code: number) {
        status = code;
        return res;
      },
      json(data: unknown) {
        body = data;
        resolve({ status, body, calledNext: false, req });
        return res;
      },
    };

    const next = () => resolve({ status: undefined, body: undefined, calledNext: true, req });

    middleware(req, res, next);
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("tierGuard — forged JWT claim bypass prevention", async () => {
  test("forged sessionClaims.tier='enterprise' + DB tier='free' → 403 (not bypassed)", async () => {
    resetState({
      sessionClaimsExtra: { tier: "enterprise" },
      dbRows: [{ tier: "free" }],
    });

    const result = await invokeMiddleware(requireTier("enterprise"));

    assert.equal(result.calledNext, false, "next() must NOT be called when DB tier is 'free'");
    assert.equal(result.status, 403, `expected 403, got ${result.status}`);

    const body = result.body as any;
    assert.equal(body.currentTier, "free", "currentTier in response must reflect the DB value, not the JWT claim");
    assert.equal(body.requiredTier, "enterprise");
  });

  test("forged sessionClaims.tier='enterprise' + DB tier='creator' → 403", async () => {
    resetState({
      sessionClaimsExtra: { tier: "enterprise" },
      dbRows: [{ tier: "creator" }],
    });

    const result = await invokeMiddleware(requireTier("enterprise"));

    assert.equal(result.calledNext, false, "next() must NOT be called when DB tier is 'creator'");
    assert.equal(result.status, 403);
    assert.equal((result.body as any).currentTier, "creator");
  });

  test("forged sessionClaims.tier='agency' + DB tier='free' → 403 for brand-level guard", async () => {
    resetState({
      sessionClaimsExtra: { tier: "agency" },
      dbRows: [{ tier: "free" }],
    });

    const result = await invokeMiddleware(requireTier("brand"));

    assert.equal(result.calledNext, false);
    assert.equal(result.status, 403);
    assert.equal((result.body as any).currentTier, "free");
  });

  test("legitimate enterprise user in DB (no forged claim) → guard passes", async () => {
    resetState({
      sessionClaimsExtra: {},
      dbRows: [{ tier: "enterprise" }],
    });

    const result = await invokeMiddleware(requireTier("enterprise"));

    assert.equal(result.calledNext, true, "next() must be called for a legitimate enterprise user");
    assert.equal(result.status, undefined);
  });

  test("DB tier matches minimum requirement → guard passes (no forged claim needed)", async () => {
    resetState({
      sessionClaimsExtra: {},
      dbRows: [{ tier: "brand" }],
    });

    const result = await invokeMiddleware(requireTier("brand"));

    assert.equal(result.calledNext, true);
    assert.equal((result.req as any).userTier, "brand", "userTier on req must be set from DB value");
  });
});

describe("tierGuard — authentication checks", async () => {
  test("no Clerk user ID (unauthenticated) → 401", async () => {
    resetState({ clerkUserId: null });

    const result = await invokeMiddleware(requireTier("creator"));

    assert.equal(result.calledNext, false);
    assert.equal(result.status, 401);
  });

  test("user not found in DB → 401", async () => {
    resetState({
      clerkUserId: "ghost_user",
      dbRows: [],
    });

    const result = await invokeMiddleware(requireTier("creator"));

    assert.equal(result.calledNext, false);
    assert.equal(result.status, 401);
    assert.match((result.body as any).error as string, /not found/i);
  });
});

describe("tierGuard — tier boundary enforcement", async () => {
  const cases: Array<{ dbTier: string; minimum: string; shouldPass: boolean }> = [
    { dbTier: "free", minimum: "creator", shouldPass: false },
    { dbTier: "creator", minimum: "brand", shouldPass: false },
    { dbTier: "brand", minimum: "agency", shouldPass: false },
    { dbTier: "agency", minimum: "enterprise", shouldPass: false },
    { dbTier: "creator", minimum: "creator", shouldPass: true },
    { dbTier: "agency", minimum: "brand", shouldPass: true },
    { dbTier: "enterprise", minimum: "agency", shouldPass: true },
  ];

  for (const { dbTier, minimum, shouldPass } of cases) {
    test(`DB tier='${dbTier}', minimum='${minimum}' → ${shouldPass ? "pass" : "403"}`, async () => {
      resetState({ dbRows: [{ tier: dbTier }] });

      const result = await invokeMiddleware(requireTier(minimum as any));

      if (shouldPass) {
        assert.equal(result.calledNext, true, `Expected guard to pass for DB tier '${dbTier}' vs minimum '${minimum}'`);
      } else {
        assert.equal(result.status, 403, `Expected 403 for DB tier '${dbTier}' vs minimum '${minimum}'`);
        assert.equal(result.calledNext, false);
      }
    });
  }
});
