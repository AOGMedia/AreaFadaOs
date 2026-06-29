import { test, describe } from "node:test";
import assert from "node:assert/strict";
import esmock from "esmock";

// esmock must be called inside test functions. We load platformPublisher.ts
// once in a shared before-like wrapper so all classifyError sub-tests share it.
// Each test is async so esmock can do its module registration on first call.

const dbStub = {
  db: {},
  publishJobsTable: {},
  platformAccountsTable: {},
  usersTable: {},
};

const loggerStub = {
  logger: { info: () => {}, warn: () => {}, error: () => {} },
};

const resendStub = {
  Resend: class { emails = { send: async () => ({}) }; },
};

// Load once, share across describe block via module-level variable
let classifyError: (err: any) => { errorCode: string; shouldRetry: boolean; retryAfterMs?: number };

describe("classifyError — HTTP status codes", async () => {
  // Load the module-under-test with mocked deps before running any tests
  const mod = await esmock("../platformPublisher.ts", {
    "@workspace/db": dbStub,
    resend: resendStub,
    "../logger.js": loggerStub,
  });
  classifyError = mod.classifyError;

  test("status 429 → rate_limit, shouldRetry: true, retryAfterMs set", () => {
    const result = classifyError({ status: 429, retryAfter: 60 });
    assert.equal(result.errorCode, "rate_limit");
    assert.equal(result.shouldRetry, true);
    assert.equal(result.retryAfterMs, 60_000);
  });

  test("status 429 with default retryAfter (900s) when not provided", () => {
    const result = classifyError({ status: 429 });
    assert.equal(result.errorCode, "rate_limit");
    assert.equal(result.retryAfterMs, 900_000);
  });

  test("message 'rate limit' triggers rate_limit even without 429 status", () => {
    const result = classifyError({ message: "You hit the rate limit", status: 200 });
    assert.equal(result.errorCode, "rate_limit");
    assert.equal(result.shouldRetry, true);
  });

  test("status 401 → auth_failure, shouldRetry: false", () => {
    const result = classifyError({ status: 401 });
    assert.equal(result.errorCode, "auth_failure");
    assert.equal(result.shouldRetry, false);
    assert.equal(result.retryAfterMs, undefined);
  });

  test("status 403 → auth_failure, shouldRetry: false", () => {
    const result = classifyError({ status: 403 });
    assert.equal(result.errorCode, "auth_failure");
    assert.equal(result.shouldRetry, false);
  });

  test("message 'unauthorized' → auth_failure", () => {
    const result = classifyError({ message: "Unauthorized request" });
    assert.equal(result.errorCode, "auth_failure");
    assert.equal(result.shouldRetry, false);
  });

  test("message 'invalid token' → auth_failure", () => {
    const result = classifyError({ message: "invalid token supplied" });
    assert.equal(result.errorCode, "auth_failure");
    assert.equal(result.shouldRetry, false);
  });

  test("status 422 → content_policy, shouldRetry: false", () => {
    const result = classifyError({ status: 422 });
    assert.equal(result.errorCode, "content_policy");
    assert.equal(result.shouldRetry, false);
  });

  test("message containing 'content policy' → content_policy", () => {
    const result = classifyError({ message: "violates content policy" });
    assert.equal(result.errorCode, "content_policy");
    assert.equal(result.shouldRetry, false);
  });

  test("status 500 → server_error, shouldRetry: true", () => {
    const result = classifyError({ status: 500 });
    assert.equal(result.errorCode, "server_error");
    assert.equal(result.shouldRetry, true);
  });

  test("status 503 → server_error, shouldRetry: true", () => {
    const result = classifyError({ status: 503 });
    assert.equal(result.errorCode, "server_error");
    assert.equal(result.shouldRetry, true);
  });

  test("status 418 (unrecognized) → unknown, shouldRetry: false", () => {
    const result = classifyError({ status: 418, message: "I am a teapot" });
    assert.equal(result.errorCode, "unknown");
    assert.equal(result.shouldRetry, false);
  });

  test("empty error object → unknown", () => {
    const result = classifyError({});
    assert.equal(result.errorCode, "unknown");
    assert.equal(result.shouldRetry, false);
  });
});
