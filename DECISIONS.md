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
