---
name: DB Project References
description: Adding new schema files to lib/db requires a manual tsc build before the api-server can see the new exports.
---

# DB Project References

## Rule
Whenever a new schema file is added to `lib/db/src/schema/`, run `cd lib/db && pnpm exec tsc -p tsconfig.json` immediately after to emit the `.d.ts` declarations into `dist/schema/`. The api-server uses TypeScript project references and reads from `dist/`, not `src/`.

**Why:** `lib/db` has `"composite": true` and `"emitDeclarationOnly": true` in its tsconfig. The api-server's tsconfig has `{ "path": "../../lib/db" }` in references, so TS resolves `@workspace/db` exports from the compiled `dist/` output, not the source files directly. New schema files added to `src/schema/` are invisible to the api-server until the declarations are emitted.

**How to apply:** After adding any new file under `lib/db/src/schema/` and exporting it from `lib/db/src/schema/index.ts`, run the build before checking api-server TS errors. Also run `pnpm run codegen` in `lib/api-spec` after updating the OpenAPI spec to regenerate the React Query hooks and Zod validators.
