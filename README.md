# Nuxt Bearer Auth

Reusable Nuxt authentication for APIs that issue bearer tokens. It is designed for Laravel-style auth responses by default, but it is not Laravel-specific: any backend that returns a bearer token and a user object can work through response path mapping.

## Features

- Nuxt module install experience
- Redis-backed server sessions
- Secure HTTP-only session cookie
- `nuxt-csurf` integration
- Generic bearer-token API adapter
- Email/Mobile and password login
- Social login
- Registration
- OTP verification and resend
- Forgot/reset password
- `/me` session hydration
- Token refresh route
- Logout
- Active session listing
- Session revocation
- SSR auth hydration
- Global route middleware
- Optional authorization with abilities normalization (disabled by default)
- Route/page authorization via `definePageMeta` metadata (`all` / `any` modes)
- Declarative `<Can>` / `<Cannot>` UI authorization components (advisory rendering only)
- Server-side `requireAbility()` guard via the `nuxt-bearer-auth/server` export
- `useBearerAuth()` composable
- `useBearerAuthSession()` composable for non-renewing session liveness
- `useAuth()` alias for convenience

## Install

```bash
npm install nuxt-bearer-auth redis nuxt-csurf
```

### Nuxt compatibility

The package declares compatibility with Nuxt `^3.12.0 || ^4.0.0`. The [automated consumer matrix](https://github.com/paaqwesilowelltetteh/nuxt-bearer-auth/actions/workflows/nuxt-compatibility.yml) targets exact releases Nuxt 3.12.0, 3.21.11, and 4.6.1 on Node.js 24.19.0 and npm 10.0.0. Nuxt 3.21.11 and 4.6.0 have been manually verified; Nuxt 3.12.0 and 4.6.1 await their CI results. These representative checks do not test every version in the declared peer range. Nuxt 3 reached end of life on July 31, 2026; use Nuxt 4 for new applications where possible.

```ts
export default defineNuxtConfig({
  modules: ["nuxt-bearer-auth"],

  bearerAuth: {
    apiBaseUrl: process.env.API_BASE_URL,
    redisUrl: process.env.REDIS_URL,

    redirects: {
      login: "/login",
      authenticated: "/dashboard",
      logout: "/",
      unauthorized: "/auth/not-allowed",
    },

    routes: {
      public: ["/", "/login", "/forgot-password", "/reset-password"],
      authPages: ["/login", "/forgot-password", "/reset-password"],
    },
  },
});
```

## Environment

```bash
API_BASE_URL=https://api.example.com
REDIS_URL=redis://127.0.0.1:6379
APP_ENV=local
```

## Default Backend Endpoints

The module exposes local Nuxt endpoints under `/api/auth/*` and proxies them to your backend.

| Local endpoint                          | Backend endpoint              |
| --------------------------------------- | ----------------------------- |
| `POST /api/auth/login`                  | `auth/login`                  |
| `POST /api/auth/social-login`           | `auth/social-login`           |
| `POST /api/auth/logout`                 | `auth/logout`                 |
| `GET /api/auth/me`                      | `auth/account/me`             |
| `POST /api/auth/refresh`                | `auth/refresh`                |
| `POST /api/auth/forgot-password`        | `auth/forgot-password`        |
| `POST /api/auth/reset-password`         | `auth/reset-password`         |
| `POST /api/auth/otp-verification`       | `auth/verify-otp`             |
| `POST /api/auth/resend-otp/:identifier` | `auth/resend-otp/:identifier` |
| `POST /api/auth/register`               | `auth/register`               |

Override any endpoint:

```ts
export default defineNuxtConfig({
  bearerAuth: {
    endpoints: {
      login: "v1/session",
      me: "v1/me",
      socialLogin: "v1/oauth/login",
    },
  },
});
```

## Backend Response Shape

The default response parser supports common bearer-token responses:

```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "token": "plain-bearer-token",
    "refresh_token": "optional-refresh-token",
    "user": {
      "id": 1,
      "email": "person@example.com"
    }
  }
}
```

It also checks top-level fallbacks like `token`, `access_token`, and `user`.

For a different API shape, map paths:

```ts
export default defineNuxtConfig({
  bearerAuth: {
    responsePaths: {
      token: ["auth.accessToken"],
      refreshToken: ["auth.refreshToken"],
      user: ["account"],
      userId: ["id"],
      message: ["message"],
      success: ["ok"],
    },
  },
});
```

## Social Login

On the client:

```ts
const auth = useBearerAuth();

await auth.socialLogin({
  provider: "google",
  jwt: googleCredential,
});
```

Your backend should validate the provider token and return the same bearer-token response shape as normal login.

## Client Usage

```vue
<script setup lang="ts">
const auth = useBearerAuth();

async function submit() {
  await auth.login({
    identifier: "person@example.com",
    password: "secret",
  });
}
</script>
```

`identifier` could be any string that identifies a user in your backend. it could be email, phone number, username, etc.

Available composable state and methods:

- `user`
- `status`
- `ready`
- `error`
- `loading`
- `isAuthenticated`
- `login`
- `socialLogin`
- `register`
- `verifyOtp`
- `fetchUser`
- `refresh`
- `logout`
- `forgotPassword`
- `resetPassword`
- `resendOtp`
- `abilities`
- `can(ability)`
- `cannot(ability)`
- `clearAuthState`

## Authorization

Authorization is opt-in and disabled by default. Backend roles, permissions, and direct abilities are normalized into a sorted `string[]`. Roles use the `role:` prefix by default.

```ts
export default defineNuxtConfig({
  bearerAuth: {
    authorization: {
      enabled: true,
      source: "session",
      responsePaths: {
        abilities: ["abilities", "data.abilities"],
        roles: ["roles", "data.roles"],
        permissions: ["permissions", "data.permissions"],
      },
      rolePrefix: "role:",
    },
    redirects: {
      unauthorized: "/auth/not-allowed",
    },
  },
});
```

```ts
const auth = useBearerAuth();

await auth.login(credentials);
auth.can("campaign.create");
auth.cannot("campaign.delete");
auth.abilities.value;
```

Abilities are persisted with the server session and hydrated during SSR. Login, social login, registration, OTP verification, refresh, and `me` responses can update them. An omitted authorization field preserves the current list; logout and failed authentication clear it. Tokens, passwords, OTPs, and raw backend responses are never authorization state.

### Client Checks Are Not Security

`auth.can()` and `auth.cannot()` are advisory UI helpers for showing or hiding controls. They do not secure APIs. A user who bypasses your UI can still call any endpoint directly, so your backend must authorize every request it receives.

### UI Authorization Components

`<Can>` and `<Cannot>` provide the same advisory checks declaratively. Both are auto-imported, evaluate the existing `auth.abilities` state reactively through one shared evaluator, and match route/server semantics exactly (exact strings, `mode` defaults to `"all"`, empty `abilities` means unrestricted, malformed props or state fail closed):

```vue
<template>
  <!-- single ability -->
  <Can ability="users.delete">
    Delete
  </Can>

  <!-- every listed ability (default) / at least one -->
  <Can :abilities="['users.view', 'users.edit']">Edit</Can>
  <Can :abilities="['reports.view', 'reports.export']" mode="any">
    Export
  </Can>

  <!-- inverse rendering -->
  <Cannot ability="users.delete">
    <template #fallback>Request access</template>
  </Cannot>
</template>
```

Unauthorized content is removed from the DOM; an optional `#fallback` slot renders instead. Disabled authorization behaves like `auth.can()` — ability state stays `null`, so `<Can>` renders fallback/nothing. SSR output matches hydration because evaluation is synchronous over the transferred state.

As with all client checks: **UI authorization controls rendering only. It never secures API requests. Your backend must authorize every request it receives.**

### Route Authorization

Pages opt in by declaring required abilities in `definePageMeta`. The global `bearer-auth` middleware enforces them when authorization is enabled:

```vue
<script setup lang="ts">
definePageMeta({
  authorization: {
    abilities: ["users.view"],
    // optional — defaults to "all"
    mode: "all",
  },
});
</script>
```

Semantics:

- `mode` defaults to `"all"`: every listed ability must exist on the session.
- `mode: "any"`: at least one listed ability must exist.
- Matching is exact string equality. `users.*`, prefixes, and hierarchy are not supported.
- Routes without metadata behave exactly as before. When `authorization.enabled` is `false`, metadata is ignored.
- Unauthenticated visitors follow the normal login flow (`?redirect=` preserved). Authenticated users without the required abilities are redirected to `redirects.unauthorized` — not to login.

Route authorization protects navigation inside your Nuxt app only. It never authorizes external API requests.

### Server Enforcement with requireAbility()

Nitro server routes use the dedicated server-only export:

```ts
import { requireAbility } from "nuxt-bearer-auth/server";

export default defineEventHandler((event) => {
  const session = requireAbility(event, "users.delete");

  // every ability required (default):
  requireAbility(event, ["users.view", "users.export"]);
  // at least one required:
  requireAbility(event, ["reports.view", "reports.export"], "any");

  return { ok: true };
});
```

Behavior:

- Throws `401 Unauthenticated` when there is no authenticated session and `403 Authorization required` when the session lacks the ability.
- Reads abilities only from `event.context.auth` — the Redis-backed server session. It never reads client state (`useState("bearer-auth-abilities")`), headers, query parameters, or request bodies.
- On success it sets `event.context.authorization = { abilities, source: "session" }` (normalized strings only, no tokens) and returns the session.
- Fails closed: if the session has no abilities, every requirement is rejected.
- The helper lives behind the `nuxt-bearer-auth/server` subpath so it is never bundled into client code.

### Security Boundary

Authorization is layered, and the lower layer is always authoritative:

```text
UI checks (auth.can)          → convenience only
Nuxt enforcement (meta/403)   → protects pages and Nuxt routes
Laravel backend               → authoritative for its own endpoints
```

`requireAbility(event, "campaign.delete")` stops your Nuxt route from running, but if that route calls `DELETE /campaigns/123`, Laravel must still authorize `campaign.delete`. This package never claims to replace backend authorization.

Declarative `<Can>` / `<Cannot>` components ship with the package — see [UI Authorization Components](#ui-authorization-components). Directives such as `v-can` are intentionally not provided.

## Redis Sessions

The backend token is stored server-side in Redis. The browser only receives a secure HTTP-only session id cookie. Nuxt server routes can read the hydrated session from:

```ts
event.context.auth;
```

## CSRF

`nuxt-csurf` is installed by default. You can customize it:

```ts
export default defineNuxtConfig({
  bearerAuth: {
    csrf: {
      enabled: true,
      cookieKey: "my_app_csrf",
      devCookieKey: "my_app_csrf_dev",
      headerName: "x-csrf-token",
    },
  },
});
```

To manage `nuxt-csurf` yourself:

```ts
export default defineNuxtConfig({
  modules: ["nuxt-csurf", "nuxt-bearer-auth"],
  bearerAuth: {
    installCsurf: false,
  },
});
```

## Route Protection

```ts
export default defineNuxtConfig({
  bearerAuth: {
    routes: {
      public: ["/", "/login", "/pricing"],
      authPages: ["/login"],
      protectedApiPrefixes: ["/api"],
      publicApiPrefixes: [
        "/api/auth/login",
        "/api/auth/register",
        "/api/_csrf",
      ],
    },
  },
});
```

### Strict API Prefix Matching

For backward compatibility, API route prefixes use the existing `startsWith` behavior by default. If you want public and protected API prefixes to match only the exact path or a path segment below the configured prefix, opt in:

```ts
export default defineNuxtConfig({
  bearerAuth: {
    routes: {
      strictPrefixMatching: true,
    },
  },
});
```

With strict matching enabled, `/api/auth/login` matches, `/api/auth/login/foo` matches, but `/api/auth/login-evil` does not.

Disable the global client middleware:

```ts
export default defineNuxtConfig({
  bearerAuth: {
    routes: {
      middleware: false,
    },
  },
});
```

## Community Direction

Planned extension points:

- first-party adapters for popular backend response shapes
- optional refresh-token rotation strategies
- role/permission hooks
- multi-tenant active context headers
- session analytics and device naming
- test fixtures for module consumers

## License

MIT


## Session Lifecycle and Liveness

The client authentication state and the server-side session are related but distinct. During SSR, Nuxt hydrates a user snapshot from the Redis-backed session. That snapshot can become stale later if the Redis session expires, is revoked from another device, or is deleted. A hydrated `isAuthenticated` value is therefore not a permanent guarantee that the server session still exists.

Nuxt Bearer Auth exposes a read-only liveness endpoint at `GET /api/auth/session` (under the configured `routes.localApiPrefix`) and the `useBearerAuthSession()` composable. The endpoint checks the opaque HTTP-only cookie against Redis and returns only `{ valid: true }`. Missing, expired, revoked, or malformed sessions receive 401. Redis/storage failures remain server errors and are reported client-side as `unavailable`, not as logout.

### Enable automatic liveness checks

Automatic checks are disabled by default to preserve existing application behaviour. Enable them in Nuxt configuration:

```ts
export default defineNuxtConfig({
  modules: ["nuxt-bearer-auth"],
  bearerAuth: {
    sessionLiveness: {
      enabled: true,
      intervalMs: 5 * 60 * 1000,
      minIntervalMs: 30 * 1000,
      validateOnMount: true,
      validateOnFocus: true,
      validateOnVisibilityChange: true,
      validateOnNavigation: false,
      onlyWhenVisible: true,
      crossTab: true,
    },
  },
});
```

Call the composable once in a persistent layout or app shell:

```vue
<script setup lang="ts">
const session = useBearerAuthSession({
  onSessionExpired() {
    // Choose the experience that fits your application:
    // show a dialog, clear app-specific state, or navigate to login.
  },
  onValidationError(error) {
    // Optional telemetry or a non-blocking connectivity notice.
    console.warn("Session validation unavailable", error);
  },
});
</script>
```

The returned API is:

- `validity`: `"unknown" | "valid" | "invalid" | "unavailable"`
- `isValid`: computed true only when the most recent probe succeeded
- `checkedAt`: timestamp of the last completed probe
- `error`: message for a temporary validation failure
- `validating`: whether this composable is currently probing
- `validate({ force?: boolean })`: manual validation; `force` bypasses the minimum interval

The result of `validate()` is `"valid" | "invalid" | "unavailable" | "skipped"`. A probe is skipped during SSR or when no authenticated, ready client session exists. Concurrent callers share one in-flight request. Successful validation does not reload the profile, set auth status to `loading`, or rotate bearer tokens.

### Triggers and defaults

- `enabled` defaults to `false`; manual validation remains available.
- `intervalMs` defaults to five minutes; set it to `0` to disable periodic checks.
- `minIntervalMs` defaults to 30 seconds and throttles all automatic triggers.
- Mount, focus, and visible-tab transitions are enabled when automatic checks are enabled.
- Navigation checks are opt-in (`validateOnNavigation: false`).
- `onlyWhenVisible: true` prevents automatic checks in hidden tabs.
- Timers and listeners are removed when the composable's Vue scope is disposed.

The same settings can be overridden per composable call. `onSessionExpired` runs for a confirmed 401 or a cross-tab invalidation. The module does not choose a login route or redirect strategy.

### Cross-tab invalidation

Cross-tab synchronisation is enabled by default (`crossTab: true`) and can be disabled in module configuration or per composable. It uses `BroadcastChannel` when available and a `storage` event fallback otherwise. Only a fixed event discriminator is transmitted; tokens, cookies, session IDs, user IDs, and profile data are never broadcast. A receiving tab clears its local auth snapshot without rebroadcasting, preventing loops.

### Sliding expiry and security

Liveness validation reads the cookie-backed Redis record directly. It does not use the ordinary session getter, which renews sliding expiry and updates activity metadata. The liveness endpoint does not extend Redis TTL, change activity timestamps, clear or refresh cookies, call the upstream API, or return session secrets. Only ordinary authenticated application requests continue to renew sliding activity under the existing policy.

The endpoint is not a session-enumeration API: it accepts only the caller's opaque HTTP-only cookie and reveals no session identifiers or account details. It is a GET request and does not bypass CSRF protections for state-changing operations. Do not use client-side validity as an authorization boundary; protected server routes and the upstream API remain authoritative.

During SSR the liveness composable is a no-op. The initial user snapshot can be hydrated as before; a client-side probe can then confirm the underlying session. A network, timeout, Redis, or other non-401 error produces `unavailable` and does not clear authentication state. Only a confirmed unauthenticated response produces `invalid`.
