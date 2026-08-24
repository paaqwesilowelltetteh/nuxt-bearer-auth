# DECISIONS.md — Locked Architectural Decisions

This document records locked architectural decisions for Nuxt Bearer Auth.

These decisions are immutable unless explicitly changed in a future phase with documented justification.

## Decision 1 — Abilities are the primary authorization abstraction

**Status**: Locked

**Decision**: Use `string[]` as the canonical normalized authorization model.

**Rationale**:

- Simple and flexible
- Roles and permissions both normalize to strings
- Easy to persist, transmit, test
- Not tied to any specific authorization pattern
- Works with any backend role/permission structure

**Implementation**:

- Canonical type: `type Ability = string`
- Canonical collection: `Ability[]`
- Public API: `auth.can(ability: string)`

**Consequences**:

- No RBAC engine needed
- No policy DSL needed
- Extensible to future authorization patterns

---

## Decision 2 — Authorization is optional

**Status**: Locked

**Decision**: Authorization is disabled by default and completely optional.

**Rationale**:

- Authentication must work without authorization
- Existing users must not be forced to configure authorization
- Backwards compatibility is critical
- Some applications may not need authorization features
- Opt-in reduces scope and complexity

**Implementation**:

- Default config: `{ enabled: false }`
- No authorization code executes when disabled
- No performance impact when disabled
- No configuration required when disabled

**Consequences**:

- Phase 2 can be deployed without breaking changes
- Each consumer decides if authorization is needed
- No forced dependencies or performance overhead

---

## Decision 3 — Authorization is backend agnostic

**Status**: Locked

**Decision**: The package must not depend on Laravel or any specific backend framework's authorization concepts.

**Rationale**:

- Package must work with any backend API
- Should not be locked to Laravel Gates/Policies/Permissions
- Should not be locked to Spatie Permission or similar
- Backend authorization is application-specific
- Package provides infrastructure, not framework coupling

**Explicit Non-Dependencies**:

- Laravel Gates
- Laravel Policies
- Spatie Permission
- Laravel role structures
- Any backend-specific authorization model

**What IS Supported**:

- Any backend that returns roles, permissions, or abilities
- Generic ability normalization from any structure
- Flexible response path extraction

**Consequences**:

- Broader applicability
- Simpler to integrate with non-Laravel APIs
- No Laravel framework coupling

---

## Decision 4 — Backend remains authoritative

**Status**: Locked

**Decision**: Frontend authorization never enforces backend security.

**Rationale**:

- Security can only be enforced where it matters: the server
- Client state can always be manipulated
- Authorization checks are UI hints only
- Backend must always validate
- Frontend authorization improves UX, not security

**What This Means**:

- `auth.can("x")` determines what UI shows
- Backend must still check authorization
- Backend cannot trust frontend abilities
- Client abilities are advisory only

**Example**:

```typescript
// Frontend shows create button because auth.can("campaign.create")
if (auth.can("campaign.create")) {
  <button>Create Campaign</button>
}

// But backend MUST still validate
POST /api/campaigns
Backend: if (!user.can("campaign.create")) return 403
```

**Consequences**:

- Eliminates false sense of frontend security
- Clarifies threat model
- Requires explicit backend authorization logic

---

## Decision 5 — Authentication and authorization have separate state

**Status**: Locked

**Decision**: Authentication and authorization use different state objects.

**Implementation**:

```typescript
// Authentication state (EXISTING, DO NOT CHANGE)
event.context.auth; // Authentication session
useState("bearer-auth-user"); // Client user

// Authorization state (NEW, PHASE 2)
event.context.authorization; // Server authorization state
useState("bearer-auth-abilities"); // Client authorization state
```

**Rationale**:

- Clear separation of concerns
- Authentication can work without authorization
- Authorization can be enabled/disabled independently
- Easier to reason about state
- Easier to test

**Consequences**:

- User object is never mutated to hold authorization
- Authorization state is independent
- Clear mental model

---

## Decision 6 — No authorization database

**Status**: Locked

**Decision**: Nuxt Bearer Auth does not persist authorization definitions.

**Non-Implementations**:

- User role mappings
- Role permission mappings
- Permission storage
- Policy storage
- Authorization definitions
- User-role junction tables
- Policy rule storage

**What May Persist**:

- Normalized ability state (derived from authentication)
- Session ability references
- Ability state changes for session hydration

**Rationale**:

- Package is a client/middleware, not an authorization service
- Backend is source of authority
- Keeps package small and focused
- Avoids database requirements
- Avoids schema management
- Avoids synchronization issues

**Consequences**:

- Authorization definitions stay on backend
- No additional database layer
- No schema migrations
- No user-facing admin interface needed in package

---

## Decision 7 — Runtime configuration must remain serializable

**Status**: Locked

**Decision**: Do not put functions into Nuxt runtime configuration.

**What's Not Allowed**:

```typescript
// NEVER DO THIS:
authorization: {
  resolveAbilities() {
    // ...
  }
}
```

**Rationale**:

- Runtime config is serialized/deserialized
- Functions cannot be serialized
- Runtime config is accessible from browser (public config)
- Local resolvers need different extension mechanisms

**If Local Resolution Needed**:

- Use Nitro hooks/plugins
- Use composable factory functions
- Use dedicated plugin extension point
- Not runtime configuration

**Consequences**:

- Configuration remains data-only
- Can be logged, inspected, compared
- Safe to transmit in JSON
- Clear boundary between config and logic

---

## Decision 8 — Phase discipline

**Status**: Locked

**Decision**: Phase 2 implements foundation only. Future authorization enforcement belongs to later phases.

**What Phase 2 Implements**:

- ✅ Authorization configuration
- ✅ Ability normalization (roles, permissions, abilities)
- ✅ Session ability persistence
- ✅ Server authorization state
- ✅ Client authorization state
- ✅ `auth.can()` and `auth.cannot()`
- ✅ Login/me/refresh integration
- ✅ Authorization composable API

**What Phase 2 Does NOT Implement**:

- ❌ Route authorization
- ❌ Route guards
- ❌ `<Can>` components
- ❌ `<Cannot>` components
- ❌ Authorization directives
- ❌ Server-side `requireAbility()` guards
- ❌ Automatic 403 responses
- ❌ Authorization middleware enforcement
- ❌ Authorization policy engine
- ❌ Authorization database

**Rationale**:

- Phased approach allows validation of core model
- Foundation is reusable across phases
- Later phases can be planned based on feedback
- Reduces scope and complexity
- Easier to review and validate
- Allows incremental deployment

**Future Phases**:

- Phase 3: Route-level authorization
- Phase 4: UI authorization helpers
- Phase 5: Server authorization enforcement
- Phase 6: Authorization management interface

**Consequences**:

- Phase 2 is foundation only, not complete authorization
- Each phase adds one capability
- Users gradually adopt authorization features
- Can adjust architecture based on Phase 2 usage

---

## Decision 9 — Session ability storage is optional

**Status**: Locked

**Decision**: The session may include normalized abilities, but it's not required.

**Implementation**:

```typescript
interface BearerAuthSession {
  // ...existing fields...
  abilities?: string[] | null; // Optional
}
```

**Rationale**:

- Allows persistence without requiring it
- Session deserialization must handle missing field
- Reduced session size when abilities not needed
- Allows future endpoint-based source without session persistence

**Usage**:

- If `source: "session"`, abilities extracted and stored in session
- If `source: "endpoint"`, abilities may or may not be stored
- If authorization disabled, field never set

**Consequences**:

- Backwards compatible: old sessions work fine
- Flexible: can evolve storage strategy
- Clean: field is clean when not needed

---

## Decision 10 — Response path extraction reuses existing infrastructure

**Status**: Locked

**Decision**: Authorization response extraction reuses existing `readFirstPath()` utility.

**Rationale**:

- Proven, tested path extraction logic
- Consistent with authentication response handling
- No duplicate code
- Single source of truth for path logic

**Implementation**:

- New `normalizeAuthorizationData()` function
- Uses `readFirstPath()` for each authorization field
- Follows same pattern as `normalizeAuthResponse()`

**Consequences**:

- Smaller code footprint
- Consistent behavior
- Maintainability

---

## Decision 11 — No speculative abstraction

**Status**: Locked

**Decision**: No abstract base classes, factories, or pattern implementations beyond current needs.

**Examples of What NOT to Do**:

```typescript
// ❌ Don't do this
interface AuthorizationStrategy {
  resolve(): Promise<string[]>;
}

class SessionAuthorizationStrategy implements AuthorizationStrategy {}
class EndpointAuthorizationStrategy implements AuthorizationStrategy {}

// ✅ Do this instead
if (source === "session") {
  // ...
} else if (source === "endpoint") {
  // ...
}
```

**Rationale**:

- Premature abstraction adds complexity
- Two implementations don't justify abstraction
- String-based source handling is sufficient
- Future phases can refactor if needed
- Follows existing package conventions

**Consequences**:

- Simpler code
- Easier to understand
- Easier to modify
- No unnecessary abstraction layers

---

## Decision 12 — Existing authentication APIs are immutable

**Status**: Locked

**Decision**: Do not rename, remove, or change existing authentication methods and properties.

**Protected APIs**:

- `useBearerAuth()` function signature
- `useAuth()` alias
- All properties: `user`, `status`, `ready`, `error`, `loading`, `isAuthenticated`, `serverReady`
- All methods: `login`, `socialLogin`, `register`, `verifyOtp`, `fetchUser`, `refresh`, `logout`, `forgotPassword`, `resetPassword`, `resendOtp`
- All internal helpers: `setUser`, `setAuthReady`, `setServerChecked`, `clearAuthState`

**Exceptions**:

- Adding new optional properties is OK
- Adding new methods is OK
- Changing implementation is OK if behavior is identical
- Fixing bugs is OK

**Rationale**:

- Breaking changes would require major version bump
- Existing deployments must not break
- Public API contract must be stable

**Consequences**:

- All Phase 2 additions are new APIs, not modifications
- Full backwards compatibility guaranteed

---

## Decision 13 — Session security behavior is unchanged

**Status**: Locked

**Decision**: Do not alter existing session security mechanisms.

**Protected Mechanisms**:

- Session cookie name
- Session cookie options (httpOnly, Secure, SameSite)
- Session expiration TTL
- Session UUID generation
- Redis key naming
- User session tracking

**What Can Change**:

- Session data structure (adding optional fields)
- Session serialization format (if deserializable)
- Session lookup performance

**Rationale**:

- Session security is critical
- Any change risks introducing vulnerabilities
- Existing deployments depend on current behavior

**Consequences**:

- No session redesign in Phase 2
- Only additive session changes
- Security posture remains unchanged

---

## Decision 14 — Normalization is deterministic

**Status**: Locked

**Decision**: Ability normalization produces identical results for identical inputs, always.

**Requirements**:

- Same input → same output (always)
- No random elements
- No external state dependencies
- No time-based variations
- No async randomization
- Deterministic ordering

**Consequence**:

- Results are testable
- Results are reproducible
- Results can be compared
- Caching is safe

---

## Decision 15 — Backwards compatibility is mandatory

**Status**: Locked

**Decision**: Phase 2 must not break existing Phase 1 functionality.

**Tests**:

- All existing tests pass
- All existing public APIs work identically
- All existing configuration works
- All existing behavior is preserved
- No performance degradation

**Verification**:

- Run full test suite
- No tests removed or skipped
- No configuration breakage
- Manual verification of core flows

**Consequences**:

- Phase 2 is safe to deploy
- No migration guide needed for existing users
- Opt-in authorization features
- Gradual adoption possible

---

## Summary Table

| Decision                      | Status | Immutable |
| ----------------------------- | ------ | --------- |
| Abilities primary abstraction | Locked | Yes       |
| Authorization optional        | Locked | Yes       |
| Backend agnostic              | Locked | Yes       |
| Backend authoritative         | Locked | Yes       |
| Separate auth/authz state     | Locked | Yes       |
| No authz database             | Locked | Yes       |
| Serializable config           | Locked | Yes       |
| Phase discipline              | Locked | Yes       |
| Optional session storage      | Locked | Yes       |
| Reuse path extraction         | Locked | Yes       |
| No speculative abstraction    | Locked | Yes       |
| Auth APIs immutable           | Locked | Yes       |
| Session security unchanged    | Locked | Yes       |
| Deterministic normalization   | Locked | Yes       |
| Backwards compatible          | Locked | Yes       |

All decisions are locked unless explicitly changed in a future phase with documented rationale.
