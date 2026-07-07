import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import esmock from "esmock";
import supertest from "supertest";
import express from "express";
import crypto from "crypto";

// ─── DB mock ──────────────────────────────────────────────────────────────────
// The webhook route performs:
//   - db.insert(...).values(...).onConflictDoNothing()  [suppression upsert]
//   - db.select({ id: ... }).from(...).where(...).limit(1)  [isEmailSuppressed]
//
// We track inserts separately so tests can assert what was recorded.

const insertedSuppressions: any[] = [];
let dbInsertShouldThrow = false;

function buildInsertChain(data: any): any {
  const chain: any = {
    values: (_v: any) => {
      if (!dbInsertShouldThrow) insertedSuppressions.push(_v);
      const innerChain: any = {
        onConflictDoNothing: () =>
          dbInsertShouldThrow
            ? Promise.reject(new Error("DB insert error"))
            : Promise.resolve([]),
      };
      return innerChain;
    },
  };
  return chain;
}

function buildSelectChain(rows: any[]): any {
  const p = Promise.resolve(rows);
  const chain: any = {
    from:  () => chain,
    where: () => chain,
    limit: () => chain,
    then:  p.then.bind(p),
    catch: p.catch.bind(p),
    finally: p.finally.bind(p),
  };
  return chain;
}

const mockDb: any = {
  insert: (_table: any) => buildInsertChain(null),
  select: (_fields?: any) => buildSelectChain([]),
};

// ─── Load the router with all deps mocked ────────────────────────────────────

const webhookResendModule = (await esmock(
  "../../routes/webhook-resend.ts",
  {
    "@workspace/db": {
      db: mockDb,
      emailSuppressionsTable: Symbol("emailSuppressionsTable"),
    },
    "drizzle-orm": {
      eq: () => {},
    },
  },
)) as { default: express.Router };

// ─── Express app ──────────────────────────────────────────────────────────────
// The route has the full path baked in (/webhooks/resend), so mount at root.

const app = express();

// Simulate the rawBody middleware that app.ts sets up for /api/webhooks/*
app.use((req: any, _res, next) => {
  const chunks: Buffer[] = [];
  req.on("data", (c: Buffer) => chunks.push(c));
  req.on("end", () => {
    const raw = Buffer.concat(chunks);
    req.rawBody = raw;
    try { req.body = JSON.parse(raw.toString("utf8")); } catch { req.body = {}; }
    next();
  });
});

app.use("/", webhookResendModule.default ?? webhookResendModule);

const agent = supertest(app);

// ─── Helpers ─────────────────────────────────────────────────────────────────

const WEBHOOK_SECRET_BASE64 = Buffer.from("test-webhook-secret-key-32bytes!").toString("base64");
const WEBHOOK_SECRET = `whsec_${WEBHOOK_SECRET_BASE64}`;

function signPayload(body: string, msgId = "msg_001", timestamp = String(Math.floor(Date.now() / 1000))) {
  const toSign = `${msgId}.${timestamp}.${body}`;
  const secretBytes = Buffer.from(WEBHOOK_SECRET_BASE64, "base64");
  const sig = crypto.createHmac("sha256", secretBytes).update(toSign).digest("base64");
  return { "svix-id": msgId, "svix-timestamp": timestamp, "svix-signature": `v1,${sig}` };
}

function sendEvent(payload: object, signatureHeaders?: Record<string, string>) {
  const body = JSON.stringify(payload);
  const headers = signatureHeaders ?? signPayload(body);
  return agent
    .post("/webhooks/resend")
    .set("content-type", "application/json")
    .set(headers)
    .send(body);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("POST /webhooks/resend — signature verification", () => {
  beforeEach(() => {
    process.env.RESEND_WEBHOOK_SECRET = WEBHOOK_SECRET;
    insertedSuppressions.length = 0;
    dbInsertShouldThrow = false;
  });

  test("returns 401 when RESEND_WEBHOOK_SECRET is not set", async () => {
    delete process.env.RESEND_WEBHOOK_SECRET;
    const payload = { type: "email.bounced", data: { to: ["user@example.com"], email_id: "eid_1" } };
    const body = JSON.stringify(payload);
    const headers = signPayload(body);
    const res = await agent
      .post("/webhooks/resend")
      .set("content-type", "application/json")
      .set(headers)
      .send(body);
    assert.equal(res.status, 401);
    process.env.RESEND_WEBHOOK_SECRET = WEBHOOK_SECRET;
  });

  test("returns 401 when svix signature headers are missing", async () => {
    const payload = { type: "email.bounced", data: { to: ["user@example.com"] } };
    const res = await agent
      .post("/webhooks/resend")
      .set("content-type", "application/json")
      .send(JSON.stringify(payload));
    assert.equal(res.status, 401);
  });

  test("returns 401 when signature is tampered", async () => {
    const payload = { type: "email.bounced", data: { to: ["user@example.com"] } };
    const body = JSON.stringify(payload);
    const headers = signPayload(body);
    headers["svix-signature"] = "v1,invalidsignature==";
    const res = await agent
      .post("/webhooks/resend")
      .set("content-type", "application/json")
      .set(headers)
      .send(body);
    assert.equal(res.status, 401);
  });

  test("returns 401 when no body and signature headers are invalid", async () => {
    const res = await agent
      .post("/webhooks/resend")
      .set("content-type", "application/json")
      .set("svix-id", "msg_x")
      .set("svix-timestamp", "123")
      .set("svix-signature", "v1,invalidsig==");
    assert.equal(res.status, 401);
  });
});

describe("POST /webhooks/resend — email.bounced", () => {
  beforeEach(() => {
    process.env.RESEND_WEBHOOK_SECRET = WEBHOOK_SECRET;
    insertedSuppressions.length = 0;
    dbInsertShouldThrow = false;
  });

  test("returns 200 and received:true for a valid bounce event", async () => {
    const payload = {
      type: "email.bounced",
      data: { to: ["bounced@example.com"], email_id: "eid_bounce_1", bounced_at: "2026-06-29T10:00:00Z" },
    };
    const res = await sendEvent(payload);
    assert.equal(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.equal(res.body.received, true);
    assert.equal(res.body.type, "email.bounced");
  });

  test("records the bounced address in the suppression table", async () => {
    const payload = {
      type: "email.bounced",
      data: { to: ["bounced@example.com"], email_id: "eid_bounce_2", bounced_at: "2026-06-29T10:00:00Z" },
    };
    await sendEvent(payload);
    assert.equal(insertedSuppressions.length, 1, "Should have inserted one suppression record");
    const record = insertedSuppressions[0];
    assert.equal(record.email, "bounced@example.com");
    assert.equal(record.eventType, "bounce");
    assert.ok(record.reason.includes("bounce"), `reason should mention bounce: ${record.reason}`);
  });

  test("records the Resend email ID on the suppression", async () => {
    const payload = {
      type: "email.bounced",
      data: { to: ["another@example.com"], email_id: "eid_bounce_3" },
    };
    await sendEvent(payload);
    assert.equal(insertedSuppressions[0].resendEmailId, "eid_bounce_3");
  });

  test("returns 422 when bounce event has no email address", async () => {
    const payload = { type: "email.bounced", data: { email_id: "eid_noemail" } };
    const res = await sendEvent(payload);
    assert.equal(res.status, 422, `Expected 422, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.equal(insertedSuppressions.length, 0, "Nothing should be inserted when email is missing");
  });
});

describe("POST /webhooks/resend — email.complained", () => {
  beforeEach(() => {
    process.env.RESEND_WEBHOOK_SECRET = WEBHOOK_SECRET;
    insertedSuppressions.length = 0;
    dbInsertShouldThrow = false;
  });

  test("returns 200 and received:true for a valid complaint event", async () => {
    const payload = {
      type: "email.complained",
      data: { to: ["spammer@example.com"], email_id: "eid_complaint_1", complained_at: "2026-06-29T11:00:00Z" },
    };
    const res = await sendEvent(payload);
    assert.equal(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.equal(res.body.received, true);
    assert.equal(res.body.type, "email.complained");
  });

  test("records the complained address with eventType=complaint", async () => {
    const payload = {
      type: "email.complained",
      data: { to: ["spammer@example.com"], email_id: "eid_complaint_2", complained_at: "2026-06-29T11:00:00Z" },
    };
    await sendEvent(payload);
    assert.equal(insertedSuppressions.length, 1);
    const record = insertedSuppressions[0];
    assert.equal(record.email, "spammer@example.com");
    assert.equal(record.eventType, "complaint");
    assert.ok(record.reason.toLowerCase().includes("complaint"), `reason should mention complaint: ${record.reason}`);
  });

  test("returns 422 when complaint event has no email address", async () => {
    const payload = { type: "email.complained", data: { email_id: "eid_noemail_c" } };
    const res = await sendEvent(payload);
    assert.equal(res.status, 422, `Expected 422, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.equal(insertedSuppressions.length, 0);
  });
});

describe("POST /webhooks/resend — unhandled event types", () => {
  beforeEach(() => {
    process.env.RESEND_WEBHOOK_SECRET = WEBHOOK_SECRET;
    insertedSuppressions.length = 0;
  });

  test("returns 200 with received:true for email.delivered (not a suppression event)", async () => {
    const payload = { type: "email.delivered", data: { to: ["ok@example.com"], email_id: "eid_delivered" } };
    const res = await sendEvent(payload);
    assert.equal(res.status, 200);
    assert.equal(res.body.received, true);
    assert.equal(insertedSuppressions.length, 0, "email.delivered must NOT create a suppression");
  });

  test("returns 200 with received:true for email.opened", async () => {
    const payload = { type: "email.opened", data: { to: ["ok@example.com"], email_id: "eid_open" } };
    const res = await sendEvent(payload);
    assert.equal(res.status, 200);
    assert.equal(insertedSuppressions.length, 0);
  });
});

describe("POST /webhooks/resend — DB failure", () => {
  beforeEach(() => {
    process.env.RESEND_WEBHOOK_SECRET = WEBHOOK_SECRET;
    insertedSuppressions.length = 0;
    dbInsertShouldThrow = true;
  });

  test("returns 500 when the DB insert throws", async () => {
    const payload = {
      type: "email.bounced",
      data: { to: ["bounced@example.com"], email_id: "eid_bounce_err" },
    };
    const res = await sendEvent(payload);
    assert.equal(res.status, 500, `Expected 500, got ${res.status}: ${JSON.stringify(res.body)}`);
  });
});
