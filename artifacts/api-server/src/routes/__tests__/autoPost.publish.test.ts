import { test, describe } from "node:test";
import assert from "node:assert/strict";
import esmock from "esmock";

// ─── Shared state ─────────────────────────────────────────────────────────────

const state = {
  executePublishJobCalls: [] as number[],
  selectCallIndex: 0,
  selectResults: [] as any[][],
  insertedJobs: null as any,
  updatedValues: null as any,
};

function setDb(results: any[][]) {
  state.executePublishJobCalls = [];
  state.selectCallIndex = 0;
  state.selectResults = results;
  state.insertedJobs = null;
  state.updatedValues = null;
}

// ─── DB mock ──────────────────────────────────────────────────────────────────

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
    const idx = state.selectCallIndex++;
    return buildSelectChain(state.selectResults[idx] ?? []);
  },
  insert: (_table: any) => ({
    values: (vals: any) => ({
      returning: () => {
        state.insertedJobs = vals;
        const rows = Array.isArray(vals)
          ? vals.map((v: any, i: number) => ({ id: 100 + i, ...v }))
          : [{ id: 100, ...vals }];
        return Promise.resolve(rows);
      },
    }),
  }),
  update: (_table: any) => ({
    set: (vals: any) => {
      state.updatedValues = vals;
      return { where: (_cond: any) => Promise.resolve([]) };
    },
  }),
};

// ─── executePublishJob spy ────────────────────────────────────────────────────

const mockExecutePublishJob = async (jobId: number) => {
  state.executePublishJobCalls.push(jobId);
};

// ─── fixtures ─────────────────────────────────────────────────────────────────

const mockUser = { id: 1, clerkId: "clerk_test_user", tier: "brand", displayName: "Test User" };

// ─── Load the auto-post router once with all deps mocked ──────────────────────

const autoPostRouter = (await esmock("../auto-post.ts", {
  "@workspace/db": {
    db: mockDb,
    usersTable: Symbol("usersTable"),
    postDraftsTable: Symbol("postDraftsTable"),
    publishJobsTable: Symbol("publishJobsTable"),
    platformAccountsTable: Symbol("platformAccountsTable"),
    accountGroupsTable: Symbol("accountGroupsTable"),
    accountGroupMembersTable: Symbol("accountGroupMembersTable"),
    approvalRequestsTable: Symbol("approvalRequestsTable"),
    complianceFlagsTable: Symbol("complianceFlagsTable"),
    hashtagCacheTable: Symbol("hashtagCacheTable"),
    activityLogTable: Symbol("activityLogTable"),
  },
  // Mock users.ts so requireAuth and getOrCreateUser don't call the real @clerk/express
  "../users.ts": {
    requireAuth: (req: any, _res: any, next: any) => {
      req.clerkUserId = "clerk_test_user";
      next();
    },
    getOrCreateUser: async () => mockUser,
    default: undefined,  // in case the router does `import usersRouter from "./users"`
  },
  // Mock tierGuard so requireTier does not call real @clerk/express
  "../../middlewares/tierGuard.ts": {
    requireTier: (_tier: any) => (_req: any, _res: any, next: any) => next(),
  },
  "../../lib/platformPublisher.ts": {
    executePublishJob: mockExecutePublishJob,
    fetchFollowerCount: async () => 0,
    classifyError: () => ({ errorCode: "unknown", shouldRetry: false }),
  },
  "../../lib/logger.ts": {
    logger: { info: () => {}, warn: () => {}, error: () => {} },
  },
  "@anthropic-ai/sdk": {
    default: class {
      messages = { create: async () => ({ content: [{ text: "ok" }] }) };
    },
  },
})).default;

const express = (await import("express")).default;
const request = (await import("supertest")).default;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res: any, next: any) => { req.clerkUserId = "clerk_test_user"; next(); });
  app.use("/", autoPostRouter);
  return app;
}
const app = makeApp();

// ─── Tests ────────────────────────────────────────────────────────────────────

const mockDraft = {
  id: 5,
  userId: 1,
  sourceCaption: "Great content for fans!",
  selectedPlatforms: ["x", "instagram"],
  platformVariants: {},
  platformHashtags: {},
  mediaUrls: [],
  status: "approved",
  approvalRequired: false,
};

describe("POST /auto-post/drafts/:id/publish", async () => {
  test("non-scheduled: creates one job per platform and calls executePublishJob for each", async () => {
    setDb([[mockUser], [mockDraft]]);

    const res = await request(app)
      .post("/auto-post/drafts/5/publish")
      .send({});

    assert.equal(res.status, 201, `expected 201, got ${res.status}: ${res.text}`);

    const body = res.body as { jobs: any[]; message: string };
    assert.ok(Array.isArray(body.jobs), "response must include a jobs array");
    assert.equal(body.jobs.length, 2, "one job per platform (x + instagram)");

    // Allow fire-and-forget promises to settle
    await new Promise((r) => setImmediate(r));
    assert.equal(
      state.executePublishJobCalls.length,
      2,
      "executePublishJob must be called once per non-scheduled job",
    );
    assert.deepEqual(
      state.executePublishJobCalls.sort((a, b) => a - b),
      [100, 101],
      "job IDs passed to executePublishJob must match what the DB returned",
    );
  });

  test("scheduled: creates jobs but does NOT call executePublishJob immediately", async () => {
    setDb([[mockUser], [mockDraft]]);

    const futureDate = new Date(Date.now() + 3_600_000).toISOString();
    const res = await request(app)
      .post("/auto-post/drafts/5/publish")
      .send({ scheduledAt: futureDate });

    assert.equal(res.status, 201, `expected 201, got ${res.status}: ${res.text}`);

    await new Promise((r) => setImmediate(r));
    assert.equal(
      state.executePublishJobCalls.length,
      0,
      "executePublishJob must NOT be called for scheduled jobs",
    );
    assert.equal((res.body as any).jobs.length, 2);
  });

  test("all inserted jobs have status 'pending'", async () => {
    setDb([[mockUser], [mockDraft]]);

    await request(app).post("/auto-post/drafts/5/publish").send({});

    const inserted = Array.isArray(state.insertedJobs) ? state.insertedJobs : [];
    assert.ok(inserted.length > 0, "insertedJobs must not be empty");
    for (const job of inserted) {
      assert.equal(job.status, "pending", `all created jobs must have status=pending, got: ${job.status}`);
    }
  });

  test("returns 404 when draft does not exist", async () => {
    setDb([[mockUser], []]);

    const res = await request(app).post("/auto-post/drafts/999/publish").send({});
    assert.equal(res.status, 404);
  });

  test("returns 403 when draft requires approval and is not yet approved", async () => {
    const unapprovedDraft = { ...mockDraft, approvalRequired: true, status: "pending" };
    setDb([[mockUser], [unapprovedDraft]]);

    const res = await request(app).post("/auto-post/drafts/5/publish").send({});
    assert.equal(res.status, 403);
    assert.ok((res.body as any).error.includes("approval"));
  });

  test("response message says 'queued for publishing' for immediate jobs", async () => {
    setDb([[mockUser], [mockDraft]]);

    const res = await request(app).post("/auto-post/drafts/5/publish").send({});
    assert.ok(
      (res.body as any).message.includes("queued for publishing"),
      `expected 'queued for publishing', got: ${(res.body as any).message}`,
    );
  });

  test("response message says 'scheduled' when scheduledAt is provided", async () => {
    setDb([[mockUser], [mockDraft]]);

    const futureDate = new Date(Date.now() + 3_600_000).toISOString();
    const res = await request(app)
      .post("/auto-post/drafts/5/publish")
      .send({ scheduledAt: futureDate });

    assert.ok(
      (res.body as any).message.includes("scheduled"),
      `expected 'scheduled', got: ${(res.body as any).message}`,
    );
  });
});
