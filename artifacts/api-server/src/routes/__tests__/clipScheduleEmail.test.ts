import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import esmock from "esmock";
import supertest from "supertest";
import express from "express";

// ─── Resend spy ───────────────────────────────────────────────────────────────
// Force the Resend branch so we can inspect the email payload (html + attachment).
// Must be set BEFORE the module is loaded (module-scope initialisation reads it).
process.env.RESEND_API_KEY = "test_key_clip_email";

const capturedEmails: any[] = [];

type SendBehavior = "success" | "network-error";
let sendBehavior: SendBehavior = "success";

const resendStub = {
  Resend: class {
    emails = {
      send: async (payload: any) => {
        if (sendBehavior === "network-error") {
          throw Object.assign(new Error("connect ETIMEDOUT 1.2.3.4:443"), { code: "ETIMEDOUT" });
        }
        capturedEmails.push(payload);
        return { data: { id: "msg_test_001" }, error: null };
      },
    };
  },
};

// ─── DB mock ──────────────────────────────────────────────────────────────────
// clip-engine.ts issues two db.select calls per request:
//   #0 — getDbUser:   .select().from(usersTable).where(...)   → [user] | []
//   #1 — schedules:   .select({}).from(...).leftJoin().leftJoin().where().orderBy()
//
// We use a fluent chain that resolves to the pre-loaded result for each call index.

const USER_ROW = { id: 7, clerkId: "test_clerk_id", email: "creator@example.com" };

const dbState = {
  callIndex: 0,
  results: [] as any[][],
};

function buildChain(data: any[]): any {
  const p = Promise.resolve(data);
  const chain: any = {
    from:     () => chain,
    where:    () => chain,
    leftJoin: () => chain,
    orderBy:  () => chain,
    limit:    () => chain,
    then:     p.then.bind(p),
    catch:    p.catch.bind(p),
    finally:  p.finally.bind(p),
  };
  return chain;
}

const mockDb: any = {
  select: (_fields?: any) => {
    const idx = dbState.callIndex++;
    return buildChain(dbState.results[idx] ?? []);
  },
};

function setResults(...results: any[][]) {
  capturedEmails.length = 0;
  dbState.callIndex = 0;
  dbState.results = results;
}

// ─── Middleware stubs ─────────────────────────────────────────────────────────

const requireAuthStub = (req: any, _res: any, next: any) => {
  req.clerkUserId = "test_clerk_id";
  next();
};

const requireTierStub = (_tier: string) => (_req: any, _res: any, next: any) => next();

// ─── Load the router once with all deps mocked ────────────────────────────────

const clipRouter = (await esmock(
  "../../routes/clip-engine.ts",
  {
    "@workspace/db": {
      db: mockDb,
      clipAccountsTable:       Symbol("clipAccountsTable"),
      sourceVideosTable:       Symbol("sourceVideosTable"),
      clipJobsTable:           Symbol("clipJobsTable"),
      clipsTable:              Symbol("clipsTable"),
      clipSchedulesTable:      Symbol("clipSchedulesTable"),
      brandOverlayConfigsTable:Symbol("brandOverlayConfigsTable"),
      clipPerformanceLogsTable:Symbol("clipPerformanceLogsTable"),
      usersTable:              Symbol("usersTable"),
    },
    "drizzle-orm": {
      eq:   () => {},
      and:  (...args: any[]) => args,
      gte:  () => {},
      lte:  () => {},
      desc: () => {},
      sql:  Object.assign(() => {}, { raw: () => {} }),
    },
    resend: resendStub,
    "@anthropic-ai/sdk": { default: class { messages = { create: async () => ({ content: [] }) }; } },
    "../users.ts": { requireAuth: requireAuthStub },
    "../../middlewares/tierGuard.ts": { requireTier: requireTierStub },
  },
)) as { default: express.Router };

// ─── Express app ──────────────────────────────────────────────────────────────
// The route has the full path baked in (/clip-schedules/export-email),
// so mount the router at root to avoid double-prefix stripping.

const app = express();
app.use(express.json());
app.use("/", clipRouter.default ?? clipRouter);

const agent = supertest(app);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeScheduleRow(i: number) {
  const dt = new Date(Date.now() + (i + 1) * 86400000);
  return {
    schedule: {
      id: 100 + i,
      userId: 7,
      clipId: 200 + i,
      accountId: 300 + i,
      scheduledAt: dt,
      status: "scheduled",
    },
    clip: {
      id: 200 + i,
      label: `Clip Label ${i + 1}`,
      format: "9:16",
      captionText: `Caption text for clip ${i + 1}`,
      hashtags: [`#tag${i + 1}`, "#AreaFada"],
    },
    account: {
      id: 300 + i,
      name: `Test Account ${i + 1}`,
      platform: "instagram",
      color: "#16a34a",
    },
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("POST /clip-schedules/export-email — empty schedule", () => {
  beforeEach(() => {
    // call #0: getDbUser → found
    // call #1: schedules query → empty
    setResults([USER_ROW], []);
  });

  test("returns HTTP 200", async () => {
    const res = await agent
      .post("/clip-schedules/export-email")
      .send({ recipients: ["creator@test.com"] });

    assert.equal(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
  });

  test("email body contains 'no clips scheduled' copy", async () => {
    await agent
      .post("/clip-schedules/export-email")
      .send({ recipients: ["creator@test.com"] });

    assert.equal(capturedEmails.length, 1, "Resend.emails.send must be called exactly once");
    const html: string = capturedEmails[0].html;
    assert.ok(
      /no clips (are currently )?scheduled/i.test(html),
      `Email HTML should contain 'no clips scheduled' copy but got:\n${html.slice(0, 500)}`,
    );
  });

  test("CSV attachment contains only the header row (no data rows)", async () => {
    await agent
      .post("/clip-schedules/export-email")
      .send({ recipients: ["creator@test.com"] });

    assert.equal(capturedEmails.length, 1);
    const attachment = capturedEmails[0].attachments[0];
    assert.ok(attachment, "Email must include a CSV attachment");

    const csvText = Buffer.from(attachment.content, "base64").toString("utf-8");
    const lines = csvText.split("\n").filter(l => l.trim() !== "");
    assert.equal(lines.length, 1, `CSV should have exactly 1 line (header only), got ${lines.length}:\n${csvText}`);
    assert.ok(lines[0].includes("Date"), "First CSV line must be the header row");
  });

  test("response body reports scheduleCount of 0", async () => {
    const res = await agent
      .post("/clip-schedules/export-email")
      .send({ recipients: ["creator@test.com"] });

    assert.equal(res.body.scheduleCount, 0);
    assert.equal(res.body.recipients, 1);
  });
});

describe("POST /clip-schedules/export-email — happy path (3 scheduled clips)", () => {
  const THREE_ROWS = [makeScheduleRow(0), makeScheduleRow(1), makeScheduleRow(2)];

  beforeEach(() => {
    setResults([USER_ROW], THREE_ROWS);
  });

  test("returns HTTP 200", async () => {
    const res = await agent
      .post("/clip-schedules/export-email")
      .send({ recipients: ["a@test.com", "b@test.com"] });

    assert.equal(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
  });

  test("response body reports correct scheduleCount and recipient count", async () => {
    const res = await agent
      .post("/clip-schedules/export-email")
      .send({ recipients: ["a@test.com", "b@test.com"] });

    assert.equal(res.body.scheduleCount, 3, "scheduleCount must equal the number of scheduled clips");
    assert.equal(res.body.recipients, 2, "recipients must match the number of addresses sent");
    assert.equal(res.body.status, "sent");
  });

  test("CSV attachment contains header + 3 data rows", async () => {
    await agent
      .post("/clip-schedules/export-email")
      .send({ recipients: ["a@test.com"] });

    assert.equal(capturedEmails.length, 1);
    const attachment = capturedEmails[0].attachments[0];
    assert.ok(attachment, "Email must include a CSV attachment");

    const csvText = Buffer.from(attachment.content, "base64").toString("utf-8");
    const lines = csvText.split("\n").filter(l => l.trim() !== "");
    assert.equal(lines.length, 4, `CSV must have 1 header + 3 data rows, got ${lines.length}:\n${csvText}`);
  });

  test("CSV data rows contain the correct clip labels", async () => {
    await agent
      .post("/clip-schedules/export-email")
      .send({ recipients: ["a@test.com"] });

    const attachment = capturedEmails[0].attachments[0];
    const csvText = Buffer.from(attachment.content, "base64").toString("utf-8");
    const [_header, ...dataRows] = csvText.split("\n").filter(l => l.trim() !== "");

    for (let i = 0; i < 3; i++) {
      assert.ok(
        dataRows[i].includes(`Clip Label ${i + 1}`),
        `Row ${i + 1} should contain 'Clip Label ${i + 1}': ${dataRows[i]}`,
      );
    }
  });

  test("email HTML does NOT contain the 'no clips scheduled' copy", async () => {
    await agent
      .post("/clip-schedules/export-email")
      .send({ recipients: ["a@test.com"] });

    const html: string = capturedEmails[0].html;
    assert.ok(
      !/no clips (are currently )?scheduled/i.test(html),
      "Email HTML must NOT contain the empty-schedule copy when clips exist",
    );
  });

  test("email is addressed to all provided recipients", async () => {
    await agent
      .post("/clip-schedules/export-email")
      .send({ recipients: ["a@test.com", "b@test.com"] });

    const sentTo: string[] = capturedEmails[0].to;
    assert.deepEqual(sentTo.sort(), ["a@test.com", "b@test.com"]);
  });
});

describe("POST /clip-schedules/export-email — Resend network exception (timeout / DNS failure)", () => {
  beforeEach(() => {
    sendBehavior = "network-error";
    setResults([USER_ROW], [makeScheduleRow(0)]);
  });

  // Restore default behaviour after each test so other suites are unaffected.
  const afterEach = () => { sendBehavior = "success"; };

  test("returns HTTP 503", async () => {
    const res = await agent
      .post("/clip-schedules/export-email")
      .send({ recipients: ["creator@test.com"] });
    afterEach();
    assert.equal(res.status, 503, `Expected 503, got ${res.status}: ${JSON.stringify(res.body)}`);
  });

  test("response includes retryable: true", async () => {
    const res = await agent
      .post("/clip-schedules/export-email")
      .send({ recipients: ["creator@test.com"] });
    afterEach();
    assert.equal(res.body.retryable, true, `Expected retryable:true in body: ${JSON.stringify(res.body)}`);
  });

  test("response includes a user-friendly error message", async () => {
    const res = await agent
      .post("/clip-schedules/export-email")
      .send({ recipients: ["creator@test.com"] });
    afterEach();
    assert.ok(
      typeof res.body.error === "string" && res.body.error.length > 0,
      `Expected a non-empty error string in body: ${JSON.stringify(res.body)}`,
    );
  });

  test("response body detail contains the underlying error message", async () => {
    const res = await agent
      .post("/clip-schedules/export-email")
      .send({ recipients: ["creator@test.com"] });
    afterEach();
    assert.ok(
      typeof res.body.detail === "string" && res.body.detail.includes("ETIMEDOUT"),
      `Expected detail to contain 'ETIMEDOUT': ${JSON.stringify(res.body)}`,
    );
  });

  test("no email is captured by the Resend stub (send never completes)", async () => {
    await agent
      .post("/clip-schedules/export-email")
      .send({ recipients: ["creator@test.com"] });
    afterEach();
    assert.equal(capturedEmails.length, 0, "No email should be captured when network throws");
  });
});
