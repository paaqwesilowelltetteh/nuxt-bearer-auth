# Architectural Decisions

1. Authorization is optional and disabled by default.
2. Abilities are canonical: a flat `string[]`; roles and permissions are input formats.
3. Roles use a configurable `role:` prefix to prevent naming collisions.
4. Phase 2 authorization is session-derived from applicable authentication responses.
5. Missing authorization configuration means disabled for backwards compatibility.
6. Omitted response data preserves known abilities; logout and auth failure clear them.
7. Client checks are advisory; the backend remains authoritative.
8. `event.context.auth` and `event.context.authorization` remain separate.
9. Only normalized abilities are persisted; raw responses and secrets are excluded.
10. Ability matching is exact; wildcards are not supported.
11. Endpoint-source fetching and local resolvers are deferred to avoid speculative architecture.
12. Route enforcement, UI authorization, server guards, policies, and authorization persistence are outside Phase 2.
13. Optional session fields preserve compatibility with old Redis sessions.
14. Tests must prove configuration safety, flow synchronization, context separation, SSR safety, and secret exclusion.
15. Documentation records verified architecture and deferred work rather than duplicating the implementation prompt.
16. Authorization is layered: UI checks → Nuxt application/server enforcement → backend authorization. The lower layer is always authoritative; Nuxt never replaces Laravel authorization.
17. Route enforcement (Phase 3) is opt-in per page via `authorization` meta (`abilities` + optional `mode`) and only runs when module authorization is enabled, exposed client-side as the serializable boolean `public.bearerAuth.authorizationEnabled`.
18. Multiple-ability requirements default to `all`; `any` is explicit. Matching is exact string equality — no wildcards, prefixes, or hierarchy.
19. `requireAbility()` is exported only from the `nuxt-bearer-auth/server` subpath to keep server code out of client bundles.
20. Server authorization trusts only `event.context.auth`. Client state, headers, query parameters, and request bodies can never grant abilities.
21. Unauthenticated requests fail with 401; authenticated-but-unauthorized requests fail with 403 on the server and redirect to `redirects.unauthorized` in route middleware. Login redirects are reserved for authentication failures.
22. Disabled authorization makes route metadata inert client-side and fails closed server-side (no abilities → every requirement rejected).
23. Ability matching fails closed on malformed state: only a well-formed non-empty `string[]` can authorize; corrupted session data yields 403/unauthorized, never a crash or implicit grant.
24. `@nuxt/schema` runtime-config augmentations live in `src/augmentations.ts`: ambient `.d.ts` files did not participate in declaration merging under this repo's config, and importing `nitropack/types` from `module.ts` breaks unbuild's declaration rollup.
25. Typechecking requires generated Nuxt types (`npm run dev:prepare` → `nuxi prepare`); `tsconfig.json` extends `.nuxt/tsconfig.json` per standard Nuxt module conventions.
