import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import esmock from "esmock";

// ─── Shared state ─────────────────────────────────────────────────────────────

const state = {
  executePublishJobCalls: [] as number[],
  updateCallIndex: 0,
  updateResults: [] as Array<{ id: number }[]>,
};

function reset(updateResults: Array<{ id: number }[]> = [[], []]) {
  state.executePublishJobCalls = [];
  state.updateCallIndex = 0;
  state.updateResults = updateResults;
}

// ─── DB mock ──────────────────────────────────────────────────────────────────
// runPublishJobScheduler makes two sequential db.update calls:
//   #0 — recoverOrphanedPublishJobs  (returns recovered ids, usually empty)
//   #1 — claim pending+due jobs      (returns the ids we want to dispatch)
//
// We hand each call the next pre-loaded result from state.updateResults.

const mockDb: any = {
  update: (_table: any) => {
    const idx = state.updateCallIndex++;
    const result: { id: number }[] = state.updateResults[idx] ?? [];
    return {
      set: (_vals: any) => ({
        where: (_cond: any) => ({
          returning: (_fields?: any) => Promise.resolve(result),
        }),
      }),
    };
  },
};

// ─── executePublishJob spy ────────────────────────────────────────────────────

const mockExecutePublishJob = async (jobId: number) => {
  state.executePublishJobCalls.push(jobId);
};

// ─── Logger stub ─────────────────────────────────────────────────────────────

const loggerStub = {
  logger: { info: () => {}, warn: () => {}, error: () => {} },
};

// ─── Resend stub ──────────────────────────────────────────────────────────────

const resendStub = {
  Resend: class {
    emails = { send: async () => ({}) };
  },
};

// ─── platformDataFetcher stub ─────────────────────────────────────────────────

const platformDataFetcherStub = {
  runDailyIngestion: async () => {},
};

// ─── Load the scheduler once with all deps mocked ────────────────────────────

const { runPublishJobScheduler, recoverOrphanedPublishJobs } = (await esmock(
  "../reminderScheduler.ts",
  {
    "@workspace/db": {
      db: mockDb,
      invoicesTable: Symbol("invoicesTable"),
      paymentRemindersTable: Symbol("paymentRemindersTable"),
      analyticsSnapshots: Symbol("analyticsSnapshots"),
      weeklyDigests: Symbol("weeklyDigests"),
      usersTable: Symbol("usersTable"),
      publishJobsTable: Symbol("publishJobsTable"),
    },
    "drizzle-orm": {
      eq: () => {},
      and: (...args: any[]) => args,
      gte: () => {},
      lte: () => {},
      lt: () => {},
      sql: Object.assign(() => {}, { raw: () => {} }),
      desc: () => {},
    },
    resend: resendStub,
    "../logger.js": loggerStub,
    "../platformDataFetcher.js": platformDataFetcherStub,
    "../platformPublisher.js": {
      executePublishJob: mockExecutePublishJob,
    },
  },
)) as {
  runPublishJobScheduler: () => Promise<void>;
  recoverOrphanedPublishJobs: (now: Date) => Promise<void>;
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("runPublishJobScheduler — polling loop", async () => {
  // Reset state before each test
  beforeEach(() => reset());

  test("picks up and executes jobs whose scheduledAt is in the past", async () => {
    // update #0 (orphan recovery) → nothing recovered
    // update #1 (claim due jobs)  → two past-due jobs claimed
    reset([[], [{ id: 10 }, { id: 11 }]]);

    await runPublishJobScheduler();

    assert.deepEqual(
      state.executePublishJobCalls.sort((a, b) => a - b),
      [10, 11],
      "executePublishJob must be called once per claimed past-due job",
    );
  });

  test("does NOT call executePublishJob when all jobs have a future scheduledAt", async () => {
    // The DB WHERE clause (scheduledAt <= now) means future jobs are never
    // returned by the UPDATE. Simulate this by returning an empty claim set.
    reset([[], []]);

    await runPublishJobScheduler();

    assert.equal(
      state.executePublishJobCalls.length,
      0,
      "no jobs should be dispatched when no past-due pending jobs exist",
    );
  });

  test("does NOT double-execute in_progress jobs — they are excluded by the pending filter", async () => {
    // An in_progress job would not match the WHERE status='pending' clause,
    // so the claim update returns nothing for it.
    reset([[], []]); // no claimed jobs

    await runPublishJobScheduler();

    assert.equal(
      state.executePublishJobCalls.length,
      0,
      "in_progress jobs must not be claimed or re-dispatched",
    );
  });

  test("does NOT re-execute already published or failed jobs", async () => {
    // published/failed rows also do not match status='pending', so they
    // are never returned by the claim update.
    reset([[], []]); // no claimed jobs

    await runPublishJobScheduler();

    assert.equal(
      state.executePublishJobCalls.length,
      0,
      "published/failed jobs must not be dispatched again",
    );
  });

  test("executes exactly one job when only one past-due job is pending", async () => {
    reset([[], [{ id: 42 }]]);

    await runPublishJobScheduler();

    assert.equal(state.executePublishJobCalls.length, 1);
    assert.equal(state.executePublishJobCalls[0], 42);
  });

  test("orphan recovery runs before the claim step — recovered jobs can be claimed in the same tick", async () => {
    // update #0 (orphan recovery): pretend 1 stuck job was reset to pending
    // update #1 (claim step):      that same job is now claimed and dispatched
    reset([[{ id: 99 }], [{ id: 99 }]]);

    await runPublishJobScheduler();

    assert.equal(
      state.updateCallIndex,
      2,
      "both the orphan-recovery update and the claim update must run",
    );
    assert.ok(
      state.executePublishJobCalls.includes(99),
      "the orphaned job recovered in the same tick must be dispatched",
    );
  });

  test("executePublishJob errors do not abort other jobs in the same batch", async () => {
    // Three jobs claimed; the spy for job 20 throws.
    const localCalls: number[] = [];
    const throwingExecute = async (jobId: number) => {
      localCalls.push(jobId);
      if (jobId === 20) throw new Error("publish failed for job 20");
    };

    // Re-load the scheduler with a throwing spy
    const { runPublishJobScheduler: schedulerWithThrow } = (await esmock(
      "../reminderScheduler.ts",
      {
        "@workspace/db": {
          db: (() => {
            const results: Array<{ id: number }[]> = [[], [{ id: 20 }, { id: 21 }, { id: 22 }]];
            let callIdx = 0;
            return {
              update: (_table: any) => ({
                set: (_vals: any) => ({
                  where: (_cond: any) => ({
                    returning: () => Promise.resolve(results[callIdx++] ?? []),
                  }),
                }),
              }),
            };
          })(),
          invoicesTable: Symbol("invoicesTable"),
          paymentRemindersTable: Symbol("paymentRemindersTable"),
          analyticsSnapshots: Symbol("analyticsSnapshots"),
          weeklyDigests: Symbol("weeklyDigests"),
          usersTable: Symbol("usersTable"),
          publishJobsTable: Symbol("publishJobsTable"),
        },
        "drizzle-orm": {
          eq: () => {},
          and: (...args: any[]) => args,
          gte: () => {},
          lte: () => {},
          lt: () => {},
          sql: Object.assign(() => {}, { raw: () => {} }),
          desc: () => {},
        },
        resend: resendStub,
        "../logger.js": loggerStub,
        "../platformDataFetcher.js": platformDataFetcherStub,
        "../platformPublisher.js": { executePublishJob: throwingExecute },
      },
    )) as { runPublishJobScheduler: () => Promise<void> };

    // Must not throw at the scheduler level
    await assert.doesNotReject(schedulerWithThrow());

    assert.deepEqual(
      localCalls.sort((a, b) => a - b),
      [20, 21, 22],
      "all three jobs must be attempted even though job 20 threw",
    );
  });
});

describe("recoverOrphanedPublishJobs — orphan reset", async () => {
  test("issues an UPDATE and returns without throwing when no orphans exist", async () => {
    reset([[]]); // single update call returns empty

    await assert.doesNotReject(recoverOrphanedPublishJobs(new Date()));
  });

  test("increments the update call counter (verifying it hits the DB)", async () => {
    reset([[{ id: 7 }]]); // pretend one orphan was reset

    await recoverOrphanedPublishJobs(new Date());

    assert.equal(
      state.updateCallIndex,
      1,
      "recoverOrphanedPublishJobs must issue exactly one DB update",
    );
  });
});
