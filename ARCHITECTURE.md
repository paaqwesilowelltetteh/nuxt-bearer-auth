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

This state is informational in Phase 2. No route, page, component, or API authorization is enforced.

## State

- Session: `BearerAuthSession.abilities?: string[] | null`
- Request: `event.context.authorization`
- Client: `useState("bearer-auth-abilities")`
- API: `auth.abilities`, `auth.can()`, `auth.cannot()`

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

No website repository is present in this workspace. Website synchronization remains pending.
