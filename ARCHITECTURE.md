# Architecture

## Package

The module registers local authentication routes, server middleware, a Redis plugin, an SSR plugin, and the `useBearerAuth` composable. Backend calls are proxied by Nitro using server-held bearer credentials. The browser receives an HTTP-only session cookie and derived state, never backend tokens.

## Authentication Boundary

`event.context.auth` contains the authenticated `BearerAuthSession`. Redis stores sessions under `session:{id}` and maintains a user index. Existing authentication normalization and endpoint configuration remain authoritative.

## Authorization Boundary

When enabled, applicable authentication responses produce normalized abilities. Abilities are persisted in the session and exposed server-side as:

```ts
event.context.authorization = { abilities, source: "session" };
```

Phase 3 layers enforcement on top of this state without changing it:

- **Route middleware** (`bearer-auth.global.ts`) evaluates `to.meta.authorization` after authentication checks. Unauthenticated users keep the normal login redirect; authenticated users lacking abilities are redirected to `redirects.unauthorized`. Enforcement is gated on `public.bearerAuth.authorizationEnabled`, a serializable boolean derived from the module option, so disabled deployments treat metadata as inert.
- **Server guard** (`requireAbility`, exported only via `nuxt-bearer-auth/server`) requires an authenticated session from `event.context.auth` (401 otherwise) and exact-matches required abilities with `all`/`any` semantics (403 on failure). It never reads client state or request input, sets `event.context.authorization` on success, and returns the session.
- **UI primitives** (`<Can>` / `<Cannot>`, auto-imported) render their default or optional `#fallback` slot from one shared pure client evaluator over the existing ability state. Reactive to login/refresh/logout, fail closed on malformed state, and advisory only — they never authorize API requests.

Matching is exact string equality everywhere; no wildcards or hierarchy. The Laravel backend remains authoritative for its own endpoints.

## State

- Session: `BearerAuthSession.abilities?: string[] | null`
- Request: `event.context.authorization`
- Route: `to.meta.authorization` (`AuthorizationRouteRequirement`)
- Public runtime config: `public.bearerAuth.authorizationEnabled` (derived serializable boolean)
- Client: `useState("bearer-auth-abilities")`
- API: `auth.abilities`, `auth.can()`, `auth.cannot()`
- Components: `<Can>` / `<Cannot>` via the shared pure `evaluateAbilities` utility (`src/runtime/utils/abilities.ts`)

SSR hydrates user, status, and session abilities. Logout and auth failure clear client auth state. A response omitting authorization data does not erase existing abilities.

## Configuration

Authorization is private runtime configuration and defaults to:

```ts
{
  enabled: false,
  source: "session",
  responsePaths: {
    roles: ["roles", "data.roles"],
    permissions: ["permissions", "data.permissions"],
    abilities: ["abilities", "data.abilities"]
  },
  rolePrefix: "role:"
}
```

Missing authorization configuration is treated as disabled for old mocks and deployments.

## Data Flow

1. Nitro calls the configured backend endpoint.
2. `normalizeAuthResponse` extracts authentication data.
3. `normalizeAuthorizationData` extracts roles, permissions, and abilities into a sorted unique string list.
4. The session stores only the normalized list.
5. The local response returns derived abilities and the composable synchronizes an array when present.

Endpoint-source authorization and a local resolver are not implemented. A future extension must remain server-side and use the existing normalization boundary.

## Website

The website repository (`../nuxt-bearer-auth-website`) is available and synchronized through Phase 3: an Authorization guide covers the three-layer model, client checks, route metadata, `requireAbility()`, and 401/403 semantics.
