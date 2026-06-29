---
name: esmock Integration Test Patterns
description: How to write integration tests with esmock in this project — path resolution rules, Clerk mocking, Express mounting, and test runner flags
---

# esmock Integration Test Patterns

## esmock mock key path resolution
Mock keys for LOCAL file imports are resolved relative to the TEST FILE, not the module being tested.

- ❌ `"../lib/platformPublisher.js"` (relative to module under test)  
- ✅ `"../../lib/platformPublisher.ts"` (relative to test file in `src/routes/__tests__/`)

**Why:** esmock calls `resolver(mockKey, testFileURL)` — not `resolver(mockKey, moduleUnderTestURL)`. Both must resolve to the same absolute path for intercept to fire.

**How to apply:** Always compute the relative path from `__tests__/` to the actual `.ts` file. Use `.ts` extension (esmock's resolver tries extension remapping but the lookup starts from the test file).

## Avoiding double-prefix on Express routes
If a router registers routes with the FULL prefix baked in (e.g. `router.get("/oauth/:platform/start", ...)`), mount it at root in tests:

- ❌ `app.use("/oauth", oauthRouter)` → strips `/oauth`, can't find `/oauth/x/start`
- ✅ `app.use("/", oauthRouter)` → path `/oauth/x/start` is matched correctly

**Why:** Express strips the mount path before handing off to the router. If the route was written with the full path, mounting at the same prefix double-strips.

## Mocking @clerk/express for routes that import users.ts
Routes that import `requireAuth` from `./users` (or `requireTier` from `../middlewares/tierGuard`) bring in the REAL `@clerk/express` transitively. Mock these middleware files directly:

```typescript
"../users.ts": {
  requireAuth: (req, _res, next) => { req.clerkUserId = "test_id"; next(); },
},
"../../middlewares/tierGuard.ts": {
  requireTier: (_tier) => (_req, _res, next) => next(),
},
```

## --test-force-exit for supertest
supertest keeps the Express server's socket open, preventing Node's test runner from exiting. Always use `--test-force-exit` in the test script when integration tests use supertest.

## Node version context
Node 24.13.0 — `mock.module` from `node:test` is NOT available. Use `esmock` v2.7.6 instead.
