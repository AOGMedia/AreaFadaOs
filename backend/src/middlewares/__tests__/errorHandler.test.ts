/**
 * Unit tests for errorHandler.ts
 *
 * The error handler is an Express 4-argument middleware (err, req, res, next).
 * All tests invoke it directly with a minimal mock of req/res/next so there
 * is no dependency on a live HTTP server or external services.
 *
 * Test scenarios:
 *   Status-code resolution
 *     1. Error with status 400 → response status 400, client message exposed
 *     2. Error with statusCode 422 → response status 422
 *     3. Error with status 404 → response status 404
 *     4. Error with status 500 → normalised to 500
 *     5. Error with status 503 → normalised to 500 (5xx always → 500)
 *     6. Plain Error (no status) → 500
 *     7. Non-Error thrown value (string) → 500
 *
 *   Response body
 *     8. 4xx: body.error === err.message (client-safe detail forwarded)
 *     9. 5xx: body.error === "Internal server error" (message hidden)
 *    10. 5xx in non-production: body.detail === err.message (debug aid)
 *    11. 5xx in production: body.detail is undefined (not leaked)
 *
 *   next() is never called — error handler terminates the chain
 *    12. next() is never invoked by the handler
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { errorHandler, type HttpError } from "../errorHandler.js";

// ─── Helper ───────────────────────────────────────────────────────────────────

interface HandlerResult {
  statusCode: number;
  body: Record<string, unknown>;
  nextCalled: boolean;
}

function invoke(
  err: HttpError | unknown,
  env: string = "test",
): HandlerResult {
  const original = process.env.NODE_ENV;
  process.env.NODE_ENV = env;

  let statusCode = 0;
  let body: Record<string, unknown> = {};
  let nextCalled = false;

  const req: any = {};
  const res: any = {
    status(code: number) {
      statusCode = code;
      return res;
    },
    json(data: Record<string, unknown>) {
      body = data;
      return res;
    },
  };
  const next = () => { nextCalled = true; };

  errorHandler(err as HttpError, req, res, next);

  process.env.NODE_ENV = original;
  return { statusCode, body, nextCalled };
}

// ─── Status-code resolution ───────────────────────────────────────────────────

describe("errorHandler — status-code resolution", () => {
  test("error with status 400 → responds with 400", () => {
    const err = Object.assign(new Error("Bad input"), { status: 400 });
    const { statusCode } = invoke(err);
    assert.equal(statusCode, 400);
  });

  test("error with statusCode 422 → responds with 422", () => {
    const err = Object.assign(new Error("Validation failed"), { statusCode: 422 });
    const { statusCode } = invoke(err);
    assert.equal(statusCode, 422);
  });

  test("error with status 404 → responds with 404", () => {
    const err = Object.assign(new Error("Not found"), { status: 404 });
    const { statusCode } = invoke(err);
    assert.equal(statusCode, 404);
  });

  test("error with status 500 → normalised to 500", () => {
    const err = Object.assign(new Error("Crash"), { status: 500 });
    const { statusCode } = invoke(err);
    assert.equal(statusCode, 500);
  });

  test("error with status 503 → normalised to 500 (all 5xx become 500)", () => {
    const err = Object.assign(new Error("Unavailable"), { status: 503 });
    const { statusCode } = invoke(err);
    assert.equal(statusCode, 500);
  });

  test("plain Error without status property → 500", () => {
    const err = new Error("Unhandled");
    const { statusCode } = invoke(err);
    assert.equal(statusCode, 500);
  });

  test("non-Error value thrown (string) → 500", () => {
    const { statusCode } = invoke("something went wrong");
    assert.equal(statusCode, 500);
  });
});

// ─── Response body ────────────────────────────────────────────────────────────

describe("errorHandler — response body", () => {
  test("4xx: body.error equals err.message (client-safe message forwarded)", () => {
    const err = Object.assign(new Error("Name is required"), { status: 400 });
    const { body } = invoke(err);
    assert.equal(body.error, "Name is required");
  });

  test("4xx: empty message falls back to 'Bad request'", () => {
    const err = Object.assign(new Error(""), { status: 400 });
    const { body } = invoke(err);
    assert.equal(body.error, "Bad request");
  });

  test("5xx: body.error is 'Internal server error' (original message hidden)", () => {
    const err = new Error("DB password is hunter2");
    const { body } = invoke(err, "production");
    assert.equal(body.error, "Internal server error");
    assert.equal(body.detail, undefined, "detail must not be exposed in production");
  });

  test("5xx in non-production: body.detail carries original message (debug aid)", () => {
    const err = new Error("Connection reset by peer");
    const { body } = invoke(err, "development");
    assert.equal(body.error, "Internal server error");
    assert.equal(body.detail, "Connection reset by peer");
  });

  test("5xx in production: body.detail is undefined (message not leaked)", () => {
    const err = new Error("Secret internal detail");
    const { body } = invoke(err, "production");
    assert.equal(body.detail, undefined);
  });
});

// ─── next() is never called ───────────────────────────────────────────────────

describe("errorHandler — chain termination", () => {
  test("next() is never called for a 4xx error", () => {
    const err = Object.assign(new Error("Bad"), { status: 400 });
    const { nextCalled } = invoke(err);
    assert.equal(nextCalled, false, "next() must not be called — error handler terminates the chain");
  });

  test("next() is never called for a 5xx error", () => {
    const err = new Error("Crash");
    const { nextCalled } = invoke(err);
    assert.equal(nextCalled, false);
  });
});
