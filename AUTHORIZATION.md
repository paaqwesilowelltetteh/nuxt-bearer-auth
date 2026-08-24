# AUTHORIZATION.md — Authorization Architecture

This document describes the Phase 2 authorization architecture for Nuxt Bearer Auth.

## Overview

Authorization is an **optional subsystem** built on **normalized ability strings**.

When disabled, authentication works exactly as before. No authorization code is executed.

When enabled, authorization provides a simple API to determine what the user is allowed to do, based on backend-issued ability information.

## Fundamental Principle

**Backend remains authoritative.**

Frontend authorization state determines what the Nuxt application presents and allows locally.

Frontend authorization cannot and must not be trusted to enforce backend security.

```
Frontend Authorization     Backend Authorization
     (optional)               (mandatory)

Determines what UI          Enforces what API
buttons are visible         operations are allowed

Improves UX                 Protects resources

Is never security           Is always security
```

## Authorization Model — Abilities

### The Ability

An **ability** is a string representing a capability:

```typescript
"campaign.create";
"campaign.view";
"campaign.update";
"role:admin";
```

### The Canonical Representation

All authorization is normalized into:

```typescript
type Ability = string;
type AbilityList = string[];
```

Example:

```typescript
["campaign.create", "campaign.view", "campaign.update", "role:admin"];
```

### Why Abilities?

- **Simple**: String arrays are easy to normalize, persist, and transmit
- **Flexible**: Supports arbitrary ability names, not locked to roles/permissions
- **Composable**: Roles and permissions are both converted to abilities
- **Flat**: No complex hierarchies or inheritance
- **Deterministic**: Normalization is predictable
- **Testable**: Easy to assert on collections

## Public API

### `auth.can(ability)`

Returns `true` if the user has the ability.

```typescript
const auth = useBearerAuth();

if (auth.can("campaign.create")) {
  // User can create campaigns
}
```

**Behavior**:

- Returns `true` if the ability string exists
- Returns `false` if the ability does not exist
- Returns `false` if there are no abilities (not authenticated or authorization disabled)
- Never throws
- Works with or without SSR

### `auth.cannot(ability)`

Returns `!auth.can(ability)`.

```typescript
if (auth.cannot("campaign.delete")) {
  // User cannot delete campaigns
}
```

### `auth.abilities`

Access the raw ability list.

```typescript
const auth = useBearerAuth();
console.log(auth.abilities.value); // ["campaign.create", "campaign.view", ...]
```

**Reactive**: Updates when abilities change.

**Returns**: `Ref<string[] | null>`

## Normalization

### Input Forms

Authorization information can come from backends in multiple forms:

### Form 1: Direct Abilities

Backend provides abilities directly:

```json
{
  "success": true,
  "data": {
    "user": { "id": 1, "name": "Alice" },
    "abilities": ["campaign.create", "campaign.view"]
  }
}
```

**Normalization**: Use directly as-is.

**Result**: `["campaign.create", "campaign.view"]`

### Form 2: Roles Only

Backend provides roles:

```json
{
  "success": true,
  "data": {
    "user": { "id": 1, "name": "Alice" },
    "roles": ["admin", "editor"]
  }
}
```

**Normalization**: Prefix each role.

**Result**: `["role:admin", "role:editor"]`

**Role prefix**: Configurable, defaults to `"role:"`

### Form 3: Permissions Only

Backend provides permissions:

```json
{
  "success": true,
  "data": {
    "user": { "id": 1, "name": "Alice" },
    "permissions": ["campaign.create", "campaign.view"]
  }
}
```

**Normalization**: Use directly as-is.

**Result**: `["campaign.create", "campaign.view"]`

### Form 4: Mixed (Roles + Permissions)

Backend provides both:

```json
{
  "success": true,
  "data": {
    "user": { "id": 1, "name": "Alice" },
    "roles": ["admin"],
    "permissions": ["campaign.view"]
  }
}
```

**Normalization**: Prefix roles, include permissions.

**Result**: `["role:admin", "campaign.view"]`

### Normalization Rules

1. **Missing fields** — do not throw, treat as empty
2. **null values** — treat as empty
3. **undefined values** — treat as empty
4. **Empty strings** — discard
5. **Non-string values in arrays** — discard (safe to include unexpected data)
6. **Duplicates** — remove (set deduplication)
7. **Order** — deterministic, abilities and roles in order provided
8. **Backend mutations** — do not mutate original response

Example normalization:

```typescript
// Input
{
  roles: ["admin", "admin", ""],
  permissions: ["posts.view", "posts.view", 123],
  abilities: ["admin.panel"]
}

// Output
[
  "role:admin",           // Prefixed role (dedup removed duplicate)
  "posts.view",           // Permission (dedup removed duplicate)
  "admin.panel"           // Direct ability
]

// Not returned
// - Empty role string
// - Non-string 123
// - Duplicates removed
```

## Configuration

### Authorization Configuration

```typescript
export interface BearerAuthAuthorizationConfig {
  enabled: boolean; // Disabled by default
  source: "session" | "endpoint"; // Where abilities come from
  endpoint?: string; // For endpoint source
  responsePaths?: {
    roles?: string[]; // Paths to roles in response
    permissions?: string[]; // Paths to permissions in response
    abilities?: string[]; // Paths to abilities in response
  };
  rolePrefix?: string; // Prefix for roles, default: "role:"
}
```

### Default Configuration

```typescript
{
  enabled: false,                            // Disabled
  source: "session",                         // Extract from auth responses
  responsePaths: {
    roles: ["roles", "data.roles"],
    permissions: ["permissions", "data.permissions"],
    abilities: ["abilities", "data.abilities"]
  },
  rolePrefix: "role:"
}
```

### User Configuration

```typescript
// nuxt.config.ts
export default defineNuxtConfig({
  bearerAuth: {
    authorization: {
      enabled: true,
      source: "session",
      responsePaths: {
        roles: ["roles", "data.roles"],
        permissions: ["permissions", "data.permissions"],
        abilities: ["abilities", "data.abilities"],
      },
      rolePrefix: "role:",
    },
  },
});
```

## Sources

### Session Source (Default)

Authorization information is extracted from existing authentication responses:

- `login` response
- `me` response
- `refresh` response

**Advantages**:

- No additional API call
- Reuses existing infrastructure
- Always synchronized with authentication
- Good for most use cases

**Configuration**:

```typescript
{
  enabled: true,
  source: "session"
}
```

### Endpoint Source (If Implemented)

Authorization information is obtained from a dedicated backend endpoint.

**Usage**:

```typescript
{
  enabled: true,
  source: "endpoint",
  endpoint: "auth/abilities"  // Authenticated endpoint
}
```

**Behavior**:

- Request occurs server-side only
- Bearer token retrieved from session, never sent to browser
- Endpoint called during:
  - Initial authentication (`login`, `register`)
  - Session refresh (`refresh`)
  - User fetch (`me`)
  - **Not** on every page request (cached)
- Response normalized to abilities
- Abilities persisted to session
- Client state updated

**Requirements**:

- Endpoint must be authenticated
- Bearer token must remain server-side
- Response must be normalized to abilities format

## Server-side Authorization State

### Location

```typescript
event.context.authorization;
```

### Structure

```typescript
interface AuthorizationState {
  abilities: string[];
  source: "session" | "endpoint";
}
```

### Usage in Server Handlers

```typescript
export default defineEventHandler(async (event) => {
  const auth = event.context.auth; // Authentication
  const authz = event.context.authorization; // Authorization

  if (!auth) {
    throw createError({ statusCode: 401, statusMessage: "Unauthenticated" });
  }

  if (authz?.abilities.includes("campaign.create")) {
    // User has explicit ability
  } else {
    // Frontend may show create button, but backend must authorize
    // Never trust client abilities for backend authorization
  }

  // Always authorize against backend rules
  // Client abilities are UI hints only
});
```

### Lifecycle

1. **Set during authentication** — normalization occurs, abilities stored
2. **Updated on refresh** — abilities re-normalized if authorization enabled
3. **Available in handlers** — accessible via `event.context.authorization`
4. **Never mutated** — cleared on logout
5. **Optional** — undefined when authorization disabled

## Client-side Authorization State

### Location

```typescript
const abilities = useState("bearer-auth-abilities", () => null);
```

### Structure

```typescript
Ref<string[] | null>;
```

### Access via Composable

```typescript
const auth = useBearerAuth();
auth.abilities; // Ref<string[] | null>
```

### Usage in Components

```vue
<script setup>
const auth = useBearerAuth();
</script>

<template>
  <div v-if="auth.can('campaign.create')">
    <button @click="createCampaign">Create Campaign</button>
  </div>

  <div v-if="auth.cannot('campaign.delete')">
    <p>You don't have permission to delete campaigns</p>
  </div>
</template>
```

### Lifecycle

1. **Null initially** — not yet hydrated
2. **Hydrated from server** — SSR plugin sets initial value
3. **Updated on login** — after authentication, abilities extracted
4. **Updated on refresh** — after token refresh, abilities extracted
5. **Updated on me** — after fetching user, abilities extracted
6. **Cleared on logout** — set to null

### Reactive

Changes to abilities automatically update computed properties:

```typescript
const auth = useBearerAuth();
watch(
  () => auth.abilities.value,
  (newAbilities) => {
    console.log("Abilities changed:", newAbilities);
  },
);
```

## Session Persistence

### Storage

Normalized abilities may be persisted in the Redis session:

```typescript
interface BearerAuthSession {
  // ...existing fields...
  abilities?: string[] | null;
}
```

### Key Points

- **Optional field** — existing sessions deserialize safely without it
- **Normalized** — contains only strings
- **Minimal** — stores only necessary data
- **Not duplicated** — does not copy roles/permissions/raw data
- **Cleared on logout** — removed when session deleted

### Persistence Rules

- Store only after normalization
- Do not store raw role/permission structures
- Do not store backend response objects
- Do not duplicate tokens
- Do not duplicate user profile (already stored separately)

## Integration Points

### Login Flow

When user logs in and authorization is enabled:

1. Backend returns authentication response (login)
2. Response normalized for authentication (token, user, etc.)
3. Response also extracted for authorization (roles, permissions, abilities)
4. Abilities normalized according to configuration
5. Abilities stored in Redis session
6. Abilities hydrated to client state
7. User logged in successfully

**Configuration used**: `responsePaths.roles`, `responsePaths.permissions`, `responsePaths.abilities`, `rolePrefix`

### Me / User Fetch

When user information is refreshed and authorization is enabled:

1. Backend returns user response (me)
2. Response normalized for authentication (user)
3. Response also extracted for authorization
4. Abilities normalized
5. Abilities updated in Redis session
6. Abilities updated in client state
7. User information refreshed

**Timing**: Only if authorization enabled and response contains authorization info

### Refresh Flow

When token is refreshed and authorization is enabled:

1. Backend returns refresh response (refresh)
2. Response normalized for authentication (token, user, etc.)
3. Response also extracted for authorization (if present)
4. Abilities normalized
5. Abilities updated in session
6. Abilities updated in client state
7. Token refreshed successfully

**Note**: If refresh response doesn't include authorization, abilities remain unchanged

## Unimplemented — Future Phases

### NOT in Phase 2

- Route authorization
- UI authorization guards via `requireAbility()`
- Server-side authorization guards
- `<Can>` and `<Cannot>` components
- Authorization page metadata
- Authorization databases
- Policy engines
- RBAC systems
- Role CRUD operations
- Permission CRUD operations
- Role assignment operations
- Authorization enforcement

These are reserved for future phases.

### Extension Points Reserved

- Nitro hook for local ability resolution
- Additional authorization sources via plugin system
- Integration with Nitro route rules (future)

These will be developed when needed.

## What's NOT Implemented

### No Role-Based Access Control (RBAC)

Roles are optionally normalized into abilities but there is no RBAC engine:

```typescript
// Not implemented:
// - Role hierarchy
// - Role templates
// - Dynamic role assignment
// - Role CRUD operations
// - Permission templates
// - Permission management
```

Just normalization: `role:admin` becomes a string in the ability list.

### No Policy Engine

```typescript
// Not implemented:
// - Policy classes
// - Policy conditions
// - Policy evaluation
// - Dynamic policy loading
```

Just string matching: `auth.can("campaign.create")`

### No Authorization Database

```typescript
// Not implemented:
// - User role mappings
// - Role permission mappings
// - Permission storage
// - Policy storage
// - Authorization audit logs
```

Just transient ability state derived from authentication response.

### No Server Guards

```typescript
// Not implemented:
// - requireAbility() middleware
// - requireRole() middleware
// - definePageMeta({ authorization: ... })
// - Automatic 403 responses
// - Authorization redirects
```

Server handlers must check authorization manually if needed.

### No UI Guards

```typescript
// Not implemented:
// - <Can> component
// - <Cannot> component
// - v-can directive
// - v-cannot directive
// - Authorization middleware for routes
// - UI component auto-hiding based on abilities
```

Components check abilities manually or use conditionals.

## Security Requirements

### What Must Be True

1. ✅ Bearer tokens remain server-side
2. ✅ Refresh tokens remain server-side
3. ✅ Authorization normalization cannot expose tokens
4. ✅ Authorization API calls (if any) occur server-side
5. ✅ Client abilities contain only authorization information
6. ✅ Client abilities are not treated as security credentials
7. ✅ Frontend authorization cannot bypass backend authorization
8. ✅ Authorization state cannot be used as proof that an API operation is permitted
9. ✅ Authentication secrets are not copied into authorization state
10. ✅ Existing session security behavior remains unchanged

### Testing These Requirements

- Verify tokens never appear in `event.context.authorization`
- Verify tokens never appear in `useState("bearer-auth-abilities")`
- Verify endpoint source requests occur server-side
- Verify client-side abilities don't affect server authorization
- Verify backend rejects unauthorized requests regardless of frontend abilities
- Verify existing session cookies remain HTTP-only, Secure, SameSite

## Backwards Compatibility

### When Authorization is Disabled (Default)

- **Authentication works identically** to Phase 1
- No authorization code paths execute
- No performance impact
- No API changes
- No configuration required
- No additional state
- No additional requests

### Existing Deployments

Packages using Phase 1 continue working unchanged:

```typescript
// Existing code still works exactly the same
const auth = useBearerAuth();
if (auth.isAuthenticated) {
  // ...
}
```

Phase 2 is **completely opt-in**.

## Configuration Defaults

When authorization is not configured:

```typescript
{
  enabled: false; // Authorization disabled
  // All other config unused
}
```

No changes required from existing users.

## Next Phases

### Phase 3 — Route Authorization (Future)

May introduce:

- Route metadata for ability requirements
- Middleware enforcement
- Automatic redirects

### Phase 4 — UI Authorization (Future)

May introduce:

- Components for conditional rendering
- Directives for easier use
- Auto-hiding based on abilities

### Phase 5 — Server Guards (Future)

May introduce:

- `requireAbility()` middleware
- Automatic 403 responses
- Authorization error handling

All future phases will build on this foundation.
