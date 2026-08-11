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

`identifier` could be any string that identifies a user in your bacend. it could email, phone numder, username etc.

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
- `clearAuthState`

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
