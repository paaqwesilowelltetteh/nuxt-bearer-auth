# Agent Guidelines

Nuxt Bearer Auth is a small, backend-agnostic Nuxt authentication package.

## Boundaries

- Keep bearer and refresh tokens server-side.
- Preserve `event.context.auth` as the authentication session boundary.
- Authorization is optional, server-derived, and disabled by default.
- Authorization state is normalized to `string[]` abilities.
- Client authorization state is advisory; the backend remains authoritative.
- Route/server enforcement (Phase 3) is opt-in per route via `authorization` meta and gated on the module-level enabled flag exposed publicly as a serializable boolean.
- Server helpers live behind the `nuxt-bearer-auth/server` subpath; never re-export them from the root entry.
- Server authorization reads only `event.context.auth`; client-supplied ability data (state, headers, query, body) can never grant access.
- Still excluded: UI components/directives (`<Can>`/`<Cannot>`, Phase 4 candidates), policy engines, RBAC persistence, wildcard matching, and automatic backend/API enforcement.

## Engineering

- Inspect nearby code and tests before editing.
- Prefer existing helpers and direct functions over new abstractions.
- Preserve public APIs and old session compatibility.
- Keep configuration server-only unless explicitly safe for the browser.
- Do not put functions or secrets in runtime configuration.
- Keep roles and permissions as input formats; abilities are canonical.
- Do not introduce wildcard matching.
- Add focused tests for behavioral changes.
- Do not weaken or delete tests to make them pass.

## Validation

Run `npm run dev:prepare` before `npm run typecheck` (fresh clones have no `.nuxt/` types; tsconfig extends them). Then run `npm test`, `npm run build`, and `npm run typecheck` after implementation changes. Redis-backed tests require a reachable Redis instance. Report environment limitations and exact counts; never claim completion from a partial run.

## Git Safety

Do not reset, discard user work, create branches, or commit unless explicitly requested. Ignore unrelated changes and explain them in the final report.
