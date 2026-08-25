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
- Server-side `requireAbility()` guard via the `nuxt-bearer-auth/server` export
- `useBearerAuth()` composable
- `useAuth()` alias for convenience

## Install

```bash
npm install nuxt-bearer-auth redis nuxt-csurf
```

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

UI primitives such as `<Can>` / `<Cannot>` components are not part of this release.

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
