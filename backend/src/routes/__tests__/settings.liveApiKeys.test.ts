/**
 * Integration tests for /settings/live-api-keys routes
 *
 * Verifies that saving a new Restream PAT always clears the expired-state
 * metadata (lastVerified, keyExpired) that was stored from a prior verification
 * check.  This prevents a valid fresh key from displaying a stale red "expired"
 * badge.
 *
 * Covered scenarios:
 *   1. PUT a new Restream key over an existing expired one → GET shows
 *      keyExpired: null and lastVerified: null
 *   2. PUT a new Restream key when no prior row exists → GET shows
 *      configured: true, keyExpired: null, lastVerified: null
 *   3. PUT with a non-Restream key (youtubeApiKey only) → the DB update for
 *      Restream is never called (no update touches the Restream row)
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import esmock from "esmock";

// ─── Shared mutable DB state ───────────────────────────────────────────────────

type PlatformRow = {
  id: number;
  userId: number;
  platform: string;
  appId: string | null;
  appSecret: string | null;
  updatedAt: Date;
};

const DB_USER = { id: 1, clerkId: "clerk_test_user" };

const mockState: {
  rows: PlatformRow[];
  nextId: number;
  selectCallIndex: number;
  /** Each entry records the `vals` passed to db.update().set(vals) */
  updates: Array<{ vals: Record<string, unknown> }>;
  inserts: Array<Partial<PlatformRow>>;
} = {
  rows: [],
  nextId: 100,
  selectCallIndex: 0,
  updates: [],
  inserts: [],
};

function resetState(initialRows: Partial<PlatformRow>[] = []) {
  mockState.rows = initialRows.map((r, i) => ({
    id: 10 + i,
    userId: DB_USER.id,
    platform: r.platform ?? "restream_live_api",
    appId: r.appId ?? null,
    appSecret: r.appSecret ?? null,
    updatedAt: new Date(),
    ...r,
  }));
  mockState.nextId = 200;
  mockState.selectCallIndex = 0;
  mockState.updates = [];
  mockState.inserts = [];
}

// ─── DB mock ──────────────────────────────────────────────────────────────────
// select() uses an auto-routing strategy:
//   call 0  → usersTable lookup  → returns [DB_USER]
//   call 1+ → platformOauthConfigsTable lookup → returns all rows in mockState.rows
//
// update() records the set-values in mockState.updates but does NOT mutate
// mockState.rows.  Tests that need to verify GET responses after a PUT must
// instead inspect mockState.updates or trust the existing mockState.rows.
//
// insert() appends to mockState.rows so that a subsequent GET can see the new row.

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
    if (idx === 0) return buildSelectChain([DB_USER]);
    return buildSelectChain([...mockState.rows]);
  },

  update: (_table: any) => ({
    set: (vals: Record<string, unknown>) => {
      const recorded = { vals };
      mockState.updates.push(recorded);
      return {
        where: (_cond: any) => Promise.resolve(),
      };
    },
  }),

  insert: (_table: any) => ({
    values: (vals: Partial<PlatformRow>) => {
      const row: PlatformRow = {
        id: mockState.nextId++,
        userId: DB_USER.id,
        platform: vals.platform ?? "unknown",
        appId: vals.appId ?? null,
        appSecret: vals.appSecret ?? null,
        updatedAt: new Date(),
      };
      mockState.rows.push(row);
      mockState.inserts.push(vals);
      return Promise.resolve();
    },
  }),
};

// ─── Load router with mocked deps ─────────────────────────────────────────────

const settingsRouter = (
  await esmock("../settings.ts", {
    "@clerk/express": {
      getAuth: (_req: any) => ({ userId: DB_USER.clerkId }),
    },
    "@workspace/db": {
      db: mockDb,
      usersTable: Symbol("usersTable"),
      platformOauthConfigsTable: Symbol("platformOauthConfigsTable"),
    },
    "../../lib/tokenEncryption.ts": {
      encryptToken: (val: string) => `enc:${val}`,
      decryptToken: (val: string) => val.replace(/^enc:/, ""),
    },
  })
).default;

const express = (await import("express")).default;
const request = (await import("supertest")).default;

function makeApp() {
  const app = express();
  app.use(express.json());
  // settings.ts bakes full paths ("/settings/..."), so mount at root
  app.use("/", settingsRouter);
  return app;
}

const app = makeApp();

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("PUT /settings/live-api-keys → clears Restream expired metadata", async () => {
  test("saving a new key over an expired row resets keyExpired and lastVerified to null", async () => {
    // Seed an existing Restream row that has expired metadata in appId
    const expiredMeta = JSON.stringify({
      lastVerified: "2024-01-01T00:00:00.000Z",
      expired: true,
    });
    resetState([
      { platform: "restream_live_api", appId: expiredMeta, appSecret: "enc:old-pat" },
    ]);

    // Save a brand-new PAT
    const putRes = await request(app)
      .put("/settings/live-api-keys")
      .send({ restreamApiKey: "new-valid-pat-token" });

    assert.equal(
      putRes.status,
      200,
      `PUT expected 200, got ${putRes.status}: ${JSON.stringify(putRes.body)}`,
    );
    assert.deepEqual(putRes.body, { ok: true });

    // The update must have set appId to null (clearing verification metadata)
    assert.equal(mockState.updates.length, 1, "exactly one DB update should fire");
    assert.equal(
      mockState.updates[0].vals.appId,
      null,
      `PUT must reset appId to null; got: ${JSON.stringify(mockState.updates[0].vals.appId)}`,
    );

    // Now simulate the row as it would look after the update (appId cleared)
    mockState.rows[0].appId = null;
    mockState.rows[0].appSecret = "enc:new-valid-pat-token";
    mockState.selectCallIndex = 0;

    // GET should now show no expiry metadata
    const getRes = await request(app).get("/settings/live-api-keys");
    assert.equal(
      getRes.status,
      200,
      `GET expected 200, got ${getRes.status}: ${JSON.stringify(getRes.body)}`,
    );

    const body = getRes.body as {
      restream: { configured: boolean; keyExpired: boolean | null; lastVerified: string | null };
    };

    assert.equal(
      body.restream.keyExpired,
      null,
      `keyExpired should be null after saving a new key, got: ${body.restream.keyExpired}`,
    );
    assert.equal(
      body.restream.lastVerified,
      null,
      `lastVerified should be null after saving a new key, got: ${body.restream.lastVerified}`,
    );
    assert.equal(
      body.restream.configured,
      true,
      "restream should be marked as configured after saving",
    );
  });

  test("saving a key when no prior row exists creates a clean row (no expiry metadata)", async () => {
    // No pre-existing Restream row — route should INSERT
    resetState([]);

    const putRes = await request(app)
      .put("/settings/live-api-keys")
      .send({ restreamApiKey: "brand-new-pat" });

    assert.equal(putRes.status, 200);

    // An insert should have fired (not an update)
    assert.equal(mockState.updates.length, 0, "no update should fire when inserting a new row");
    assert.equal(mockState.inserts.length, 1, "one insert should fire for the new Restream row");

    // The inserted row should have no appId (no verification metadata)
    const inserted = mockState.inserts[0];
    assert.equal(
      inserted.appId ?? null,
      null,
      `inserted row must not carry verification metadata; appId: ${inserted.appId}`,
    );

    // Confirm GET reflects the new row correctly
    mockState.selectCallIndex = 0;

    const getRes = await request(app).get("/settings/live-api-keys");
    assert.equal(getRes.status, 200);

    const body = getRes.body as {
      restream: { configured: boolean; keyExpired: boolean | null; lastVerified: string | null };
    };

    assert.equal(body.restream.keyExpired, null, "keyExpired must be null for a fresh row");
    assert.equal(body.restream.lastVerified, null, "lastVerified must be null for a fresh row");
    assert.equal(body.restream.configured, true);
  });

  test("updating only a non-Restream key does NOT update the Restream row", async () => {
    // Existing Restream row with expired metadata, plus a YouTube row
    const expiredMeta = JSON.stringify({
      lastVerified: "2024-06-01T12:00:00.000Z",
      expired: true,
    });
    resetState([
      { platform: "restream_live_api", appId: expiredMeta, appSecret: "enc:rst-pat" },
      { platform: "youtube_live_api", appId: "old-yt-key", appSecret: null },
    ]);

    // Update only the YouTube key — Restream should not be touched
    const putRes = await request(app)
      .put("/settings/live-api-keys")
      .send({ youtubeApiKey: "new-yt-key" });

    assert.equal(putRes.status, 200);

    // Exactly one update fires (for YouTube), none for Restream
    assert.equal(mockState.updates.length, 1, "only one DB update should fire (YouTube)");

    // The single update must NOT be setting appId to null (which is what the
    // Restream reset path does); it should be setting appId to the new YouTube key
    const ytUpdate = mockState.updates[0].vals;
    assert.equal(
      ytUpdate.appId,
      "new-yt-key",
      `YouTube update should set appId to the new key value; got: ${ytUpdate.appId}`,
    );

    // No insert should have fired for Restream
    assert.equal(
      mockState.inserts.length,
      0,
      "no insert should fire when only YouTube key is updated",
    );
  });
});
