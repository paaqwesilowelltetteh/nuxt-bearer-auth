# ARCHITECTURE.md — Package Architecture

This document describes the actual architecture of Nuxt Bearer Auth.

## Core Authentication Flow

```
Browser
   ↓
Nuxt Application
   ↓
useBearerAuth() composable
   ↓
Server-side session (Redis-backed)
   ↓
External API (authoritative)
```

### Key Properties

1. **Bearer tokens remain server-side** — stored in Redis
2. **Browser receives only session identifier** — HTTP-only session cookie
3. **SSR-safe** — authentication hydrates server → client via payload
4. **Configurable response extraction** — adaptable to any backend response format
5. **CSRF-protected** — integrates with nuxt-csurf

## Authentication State

### Server-side: `event.context.auth`

```typescript
event.context.auth: BearerAuthSession<User>
```

Contains:

- `userId: string` — unique user identifier
- `token: string` — backend bearer token (never sent to browser)
- `refreshToken?: string | null` — backend refresh token (never sent to browser)
- `profile: User | null` — user profile
- `createdAt: string` — session creation timestamp
- `expiresAt: number` — session expiration timestamp
- `lastActivity: string` — last activity timestamp
- `userAgent?: string` — user agent string
- `ipAddress?: string` — IP address

**Set by:** Server middleware (`src/runtime/server/middleware/auth.ts`)

**Accessed by:** Server handlers (API routes) and SSR plugin

### Client-side: `useBearerAuth()`

```typescript
const auth = useBearerAuth()

// Properties
auth.user              // Ref<User | null>
auth.status            // Ref<"idle" | "loading" | "authenticated" | "unauthenticated">
auth.ready             // Ref<boolean>
auth.loading           // Computed<boolean>
auth.isAuthenticated   // Computed<boolean>
auth.error             // Ref<string | null>

// Methods
auth.login(credentials)
auth.socialLogin(credentials)
auth.register(payload)
auth.verifyOtp(payload)
auth.fetchUser(options?)
auth.refresh()
auth.logout()
auth.forgotPassword(payload)
auth.resetPassword(payload)
auth.resendOtp(identifier)
```

### SSR Hydration

1. Server-side plugin loads session from Redis
2. Session payload is attached to `nuxtApp.payload.bearerAuth`
3. Client hydrates from payload without additional requests
4. Subsequent client state uses `useState("bearer-auth-user")`

## Authorization Architecture (Phase 2+)

### Server-side: `event.context.authorization`

```typescript
event.context.authorization: AuthorizationState
```

Contains:

- `abilities: string[]` — normalized authorization abilities
- `source?: AuthorizationSource` — where abilities came from

**Set by:** Server middleware or authorization normalization layer

**Accessed by:** Server handlers for authorization decisions

**NOT set by:** Client-side code

### Client-side: `useState("bearer-auth-abilities")`

```typescript
const abilities = useState<string[] | null>(
  "bearer-auth-abilities",
  () => null,
);
```

Contains:

- Normalized ability strings for UI rendering/visibility decisions
- Never treated as security enforcement
- Used only to determine what the Nuxt application presents locally

### Canonical Representation

The canonical authorization representation is:

```typescript
type Ability = string;
type Abilities = Ability[];
```

Example:

```typescript
["campaign.create", "campaign.view", "campaign.update", "role:admin"];
```

### Authorization Sources

**Session source** — extract from existing authentication responses:

- `login` response
- `me` response
- `refresh` response

**Endpoint source** (if implemented):

- Dedicated authenticated backend endpoint
- Server-side request only
- Bearer token never exposed to browser
- Results cached appropriately

## Configuration Architecture

### Runtime Configuration

Configuration is merged and stored in `useRuntimeConfig()`:

```typescript
runtimeConfig.bearerAuth; // Private (server-only)
runtimeConfig.public.bearerAuth; // Public (browser accessible)
```

### Configuration Merging

Uses `defu()` for deep defaults:

1. Module defaults (hardcoded in `src/module.ts`)
2. User-provided options (nuxt.config.ts)
3. Environment variables (where applicable)

### Pattern for New Configuration

When adding new configuration:

```typescript
// In src/types.ts — define the interface
export interface BearerAuthAuthorizationConfig {
  enabled: boolean;
  source: AuthorizationSource;
  // ...
}

// In src/module.ts — add to module options
export interface BearerAuthModuleOptions {
  authorization?: Partial<BearerAuthAuthorizationConfig>;
}

// In src/module.ts — merge into runtime config
nuxt.options.runtimeConfig.bearerAuth = defu(
  nuxt.options.runtimeConfig.bearerAuth,
  {
    authorization: options.authorization,
  },
);
```

## Session Storage

### Redis Keys

```
session:{sessionId}           ← BearerAuthSession (JSON)
user_sessions:{userId}        ← Set of session IDs
```

### Session Persistence

Sessions are serialized to JSON and stored in Redis with TTL.

**Do not store**:

- Role definitions
- Permission definitions
- Policy structures
- Authorization databases

**May store** (when necessary):

- Normalized ability strings: `abilities?: string[]`

### Session Deserialization

Existing sessions **must deserialize safely** when new fields are added.

Fields must be optional:

```typescript
interface BearerAuthSession {
  // ...existing fields...
  abilities?: string[]; // New optional field
}
```

## Response Extraction

### Path Resolution

The `readFirstPath()` utility extracts values from nested response objects:

```typescript
readFirstPath<string>(response, ["data.token", "token", "access_token"]);
```

Tries each path in order, returns first defined/non-null value.

### Response Normalization

The `normalizeAuthResponse()` utility converts any backend response into:

```typescript
interface NormalizedAuthResponse {
  raw: unknown; // Original response
  token?: string; // Extracted bearer token
  refreshToken?: string; // Extracted refresh token
  user?: BearerAuthUser; // Extracted user object
  userId?: string; // Extracted user ID
  message?: string; // Extracted message
  success: boolean; // Success status
  code?: string | number; // Response code
  nextAction?: string; // Next action (e.g., OTP verification)
}
```

**Pattern**: Extract from multiple possible paths, return first match.

## Public Exports

### From `src/module.ts`

Exported through `package.json` `exports` field:

```json
{
  "exports": {
    ".": {
      "types": "./dist/module.d.ts",
      "import": "./dist/module.mjs"
    }
  }
}
```

### Public Types

All public types must be defined in `src/types.ts` and included in the built `.d.ts` file.

**Do not export** internal implementation types unless they are explicitly public API.

## Utilities Architecture

### `src/runtime/server/utils/config.ts`

Provides access to runtime configuration with validation.

**Functions**:

- `getBearerAuthConfig()` — returns typed configuration
- `requireApiBaseUrl()` — validates required configuration
- `getSessionCookieName()` — returns dev or prod cookie name
- `isProductionRuntime()` — checks production status

### `src/runtime/server/utils/paths.ts`

Path extraction and interpolation utilities.

**Functions**:

- `readPath(source, path)` — reads single path
- `readFirstPath(source, paths)` — reads first matching path
- `interpolatePath(path, params)` — interpolates template parameters

### `src/runtime/server/utils/sessions.ts`

Redis session management.

**Functions**:

- `getBearerAuthRedisClient()` — gets/creates Redis client
- `ensureBearerAuthRedisConnection()` — connects to Redis
- `createBearerAuthSession()` — creates new session
- `getBearerAuthSession()` — retrieves session by ID
- `updateBearerAuthSession()` — updates session
- `deleteBearerAuthSession()` — deletes session
- `getUserSessions()` — gets all user sessions
- `deleteUserSessions()` — deletes all user sessions

### `src/runtime/server/utils/normalize.ts`

Authentication response normalization.

**Functions**:

- `normalizeAuthResponse()` — normalizes backend response
- `requiresVerification()` — checks if verification required
- `requiresTwoFactor()` — checks if 2FA required

## Middleware Architecture

### Client-side Global Middleware

**File**: `src/runtime/middleware/bearer-auth.global.ts`

**Purpose**: Enforce route authentication/authorization rules

**Behavior**:

1. Checks if route is public
2. Checks if user is authenticated
3. Redirects to login if needed
4. Prevents authenticated users from accessing auth pages

**Important**: This middleware handles **authentication only** in Phase 2. Authorization route guards are a future phase.

### Server-side Middleware

**File**: `src/runtime/server/middleware/auth.ts`

**Purpose**: Set `event.context.auth` from session

**Behavior**:

1. Checks request path against public/protected lists
2. Retrieves session from Redis
3. Sets `event.context.auth` if authenticated
4. Throws 401 if protected API requires authentication

## Plugin Architecture

### SSR Server Plugin

**File**: `src/runtime/plugins/bearer-auth.server.ts`

**Purpose**: Hydrate authentication state from server → client

**Behavior**:

1. Runs only on server
2. Retrieves session from Redis
3. Sets `nuxtApp.payload.bearerAuth` for client hydration
4. Client hydrates from payload without additional requests

## Module Integration

### Auto-imports

The module auto-registers:

- `useBearerAuth` — main composable
- `useAuth` — alias for `useBearerAuth`

### Plugins Added

- Server plugin for SSR hydration
- CSRF plugin (if enabled)

### Middleware Added

- Global client middleware for route protection

### Server Handlers

- Authentication endpoints (login, register, refresh, etc.)
- CSRF endpoint

## Backwards Compatibility

### Preserved APIs

All existing public APIs must continue working:

- `useBearerAuth()` and `useAuth()` composable
- All authentication methods: `login()`, `register()`, `socialLogin()`, etc.
- All public state: `user`, `status`, `ready`, `error`, `loading`, `isAuthenticated`
- All existing server utilities and types

### Preserved Infrastructure

- Redis session storage and keys
- Session cookie name and options
- HTTP-only session cookie mechanism
- Response path extraction behavior
- Configuration structure and defaults

### Preserved Semantics

When authorization is disabled:

- No authorization requests occur
- No authorization API is added
- Authentication behaves exactly as before
- No performance impact

## Security Boundaries

### Token Security

- Bearer tokens never leave the server
- Refresh tokens never leave the server
- Tokens not included in `event.context.authorization`
- Tokens not exposed to browser JavaScript
- Session cookie is HTTP-only, Secure, SameSite

### Authorization Security

- Client authorization is UI state only, never security
- Backend remains the authoritative authorization source
- Client abilities cannot bypass backend authorization
- Backend must always authorize API operations
- Authorization state cannot be used as proof of permission

## Extension Points

### Future Authorization Hooks

Extension points for Phase 2+ authorization:

- Local ability resolver via Nitro hook
- Endpoint-based ability source
- Authorization integration with session updates

These are reserved but not implemented in Phase 2.

## Testing

### Test Structure

- Test files in `test/` directory
- Configuration in `vitest.config.ts`
- Mocking of configuration in tests
- No test database — use fixtures

### Test Utilities

- Vitest for test execution
- Mock `getBearerAuthConfig()` to control config
- Mock Redis for session tests
- Mock HTTP responses for fetch tests

## Build System

### Build Process

- `nuxt-module-builder` for module build
- TypeScript compilation to `dist/`
- Declaration file generation to `dist/module.d.ts`
- Module .mjs to `dist/module.mjs`

### Scripts

```json
{
  "build": "nuxt-module-build build",
  "dev:prepare": "nuxt-module-build --stub",
  "typecheck": "vue-tsc --noEmit",
  "test": "vitest run"
}
```

## Documentation

### Package Documentation

- `README.md` — user-facing documentation
- `CONTRIBUTING.md` — contribution guidelines
- Agent charters in code comments where appropriate

### Architecture Documentation

- This file (`ARCHITECTURE.md`)
- `AUTHORIZATION.md` — authorization-specific architecture
- `AGENTS.md` — agent behavior guidelines
- `DECISIONS.md` — locked architectural decisions
- `PROGRESS.md` — implementation progress tracking
