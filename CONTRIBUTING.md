# Contributing

Thanks for helping improve Nuxt Bearer Auth.

## Development

```bash
npm install
npm run dev:prepare
npm run build
```

## Principles

- Keep the core backend-agnostic.
- Put framework and product-specific behavior behind configuration.
- Store bearer tokens server-side only.
- Prefer typed configuration over app-specific hard-coding.
- Keep default behavior compatible with common Laravel-style auth APIs.

## Useful Test Scenarios

- Login creates a Redis session and HTTP-only cookie.
- Social login creates the same kind of session as password login.
- `/api/auth/me` returns cached profile when available.
- `/api/auth/me?refresh=true` fetches a fresh profile.
- Logout deletes Redis state and clears the cookie.
- Expired sessions are removed.
- Protected API routes reject unauthenticated requests.
- Public API routes remain available.
- CSRF-protected methods include a valid token.
