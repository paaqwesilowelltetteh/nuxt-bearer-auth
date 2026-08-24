# Progress

## Phase 2 — Authorization Foundation

Status: **in progress until the complete suite and validation commands are green**.

Implemented:

- Optional authorization configuration, disabled by default, with safe missing-config behavior.
- Normalization of abilities, roles, and permissions into sorted unique strings.
- Optional session `abilities` persistence with old-session compatibility.
- Separate server `event.context.authorization` state.
- Extraction in login, social login, register, OTP, refresh, and `me` flows.
- Client `auth.abilities`, `auth.can()`, and `auth.cannot()` state/API.
- SSR hydration and omission-preserving synchronization.

Not implemented:

- Endpoint-source fetching or a local resolver.
- Route, page, UI, or server authorization enforcement.
- Authorization database, policy engine, RBAC persistence, or wildcard matching.
- Website synchronization; no website repository is available here.

Phase 2 must not be called complete until `npm test`, `npm run build`, and `npm run typecheck` pass.
