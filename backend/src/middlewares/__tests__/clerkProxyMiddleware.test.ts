/**
 * Unit tests for clerkProxyMiddleware.ts
 *
 * getClerkProxyHost is a pure function — no mocking required.
 * clerkProxyMiddleware() factory behaviour is tested for the dev/non-production
 * path (returns a transparent pass-through next()) since we cannot spin up a
 * live Clerk FAPI connection inside the test runner.
 *
 * Test scenarios:
 *   getClerkProxyHost
 *     1. x-forwarded-host single value → returns it
 *     2. x-forwarded-host comma-delimited → returns first hop
 *     3. x-forwarded-host is an array → returns first element
 *     4. No x-forwarded-host, Host header present → returns Host
 *     5. No headers at all → returns undefined
 *     6. x-forwarded-host with whitespace padding → trimmed value returned
 *
 *   clerkProxyMiddleware() factory (non-production)
 *     7. Returns a function (middleware signature) in non-production env
 *     8. The returned middleware calls next() immediately (no-op pass-through)
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { getClerkProxyHost, clerkProxyMiddleware } from "../clerkProxyMiddleware.js";

// ─── getClerkProxyHost ─────────────────────────────────────────────────────

describe("getClerkProxyHost — header resolution", () => {
  test("single x-forwarded-host value → returned as-is", () => {
    const req = { headers: { "x-forwarded-host": "myapp.replit.app" } };
    assert.equal(getClerkProxyHost(req), "myapp.replit.app");
  });

  test("comma-delimited x-forwarded-host → first hop returned", () => {
    const req = { headers: { "x-forwarded-host": "client.example.com, proxy1.example.com" } };
    assert.equal(getClerkProxyHost(req), "client.example.com");
  });

  test("x-forwarded-host is a string array → first element returned", () => {
    const req = { headers: { "x-forwarded-host": ["original.example.com", "proxy.example.com"] } };
    assert.equal(getClerkProxyHost(req), "original.example.com");
  });

  test("no x-forwarded-host, Host header present → Host returned", () => {
    const req = { headers: { host: "fallback.example.com" } };
    assert.equal(getClerkProxyHost(req), "fallback.example.com");
  });

  test("no headers at all → undefined", () => {
    const req = { headers: {} };
    assert.equal(getClerkProxyHost(req), undefined);
  });

  test("x-forwarded-host with surrounding whitespace → trimmed", () => {
    const req = { headers: { "x-forwarded-host": "  padded.example.com  " } };
    assert.equal(getClerkProxyHost(req), "padded.example.com");
  });

  test("x-forwarded-host first hop has whitespace around comma → trimmed", () => {
    const req = { headers: { "x-forwarded-host": "  first.example.com , second.example.com" } };
    assert.equal(getClerkProxyHost(req), "first.example.com");
  });
});

// ─── clerkProxyMiddleware() factory — non-production ─────────────────────────

describe("clerkProxyMiddleware() factory — non-production environment", () => {
  test("returns a middleware function (3-arg) when NODE_ENV is not 'production'", () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = "test";
    try {
      const mw = clerkProxyMiddleware();
      assert.equal(typeof mw, "function", "factory must return a function");
      assert.equal(mw.length, 3, "returned middleware should accept (req, res, next)");
    } finally {
      process.env.NODE_ENV = original;
    }
  });

  test("non-production middleware calls next() and does not touch res", (_, done) => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    try {
      const mw = clerkProxyMiddleware();
      const req: any = {};
      const res: any = {
        status: () => { throw new Error("res.status must not be called in pass-through mode"); },
        json:   () => { throw new Error("res.json must not be called in pass-through mode"); },
      };
      const next = () => {
        process.env.NODE_ENV = original;
        done();
      };
      mw(req, res, next);
    } catch (err) {
      process.env.NODE_ENV = original;
      done(err);
    }
  });

  test("middleware is a no-op when CLERK_SECRET_KEY is missing in production", (_, done) => {
    const origEnv  = process.env.NODE_ENV;
    const origKey  = process.env.CLERK_SECRET_KEY;
    process.env.NODE_ENV = "production";
    delete process.env.CLERK_SECRET_KEY;
    try {
      const mw = clerkProxyMiddleware();
      const req: any = {};
      const res: any = {
        status: () => { throw new Error("res.status must not be called"); },
        json:   () => { throw new Error("res.json must not be called"); },
      };
      const next = () => {
        process.env.NODE_ENV  = origEnv;
        process.env.CLERK_SECRET_KEY = origKey as string;
        done();
      };
      mw(req, res, next);
    } catch (err) {
      process.env.NODE_ENV  = origEnv;
      process.env.CLERK_SECRET_KEY = origKey as string;
      done(err);
    }
  });
});
