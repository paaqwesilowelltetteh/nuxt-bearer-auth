# AGENTS.md — Coding Agent Guidelines

This document defines how future AI coding agents must work on Nuxt Bearer Auth.

## Project Identity

**Nuxt Bearer Auth** is a reusable, backend-agnostic Nuxt authentication package.

- It must not become Laravel-specific
- Laravel-compatible behavior is allowed where it is part of the generic backend response model
- The package itself must not depend on Laravel authorization concepts
- The package must remain small, predictable, secure, and backwards compatible

## General Engineering Rules

Agents must:

- **Inspect existing code before modifying it** — do not assume implementation details
- **Preserve existing architecture** — do not redesign authentication or session handling
- **Prefer small focused utilities** — avoid over-engineering
- **Follow existing project conventions** — inspect the codebase for patterns
- **Use strict TypeScript** — maintain type safety
- **Reuse existing utilities** — leverage paths.ts, config.ts, normalize.ts
- **Avoid speculative abstractions** — build only what is needed
- **Avoid unnecessary dependencies** — check existing solutions first
- **Avoid unnecessary classes** — use functions and simple interfaces
- **Avoid unnecessary factories** — use direct instantiation
- **Avoid unnecessary providers** — use composition
- **Avoid unnecessary design-pattern abstractions** — keep it simple
- **Add tests for behavioral changes** — maintain test coverage
- **Preserve backwards compatibility** — existing APIs must continue working
- **Run tests after changes** — verify `npm test` passes
- **Run the package build after changes** — verify `npm run build` succeeds
- **Verify public exports** — check that built .d.ts files are correct
- **Never claim a feature is implemented without verifying it** — always run verification commands

## Authentication Boundary

Authentication is the core feature.

- Bearer tokens must remain server-side
- The browser must never receive backend bearer tokens or refresh tokens
- Existing authentication APIs must remain backwards compatible unless a future phase explicitly changes them
- The authentication session boundary is:
  ```
  event.context.auth  ← authenticated session state
  ```
- Do not change the meaning of `event.context.auth`

## Authorization Boundary

Authorization is optional and separate from authentication.

- Authorization is represented using normalized ability strings: `string[]`
- Client-side authorization is application/UI state only
- It is never backend security
- The external API remains authoritative
- Authorization state lives in:
  ```
  event.context.authorization  ← server-side authorization state
  useState("bearer-auth-abilities")  ← client-side authorization state
  ```

## Phase Discipline

Agents must not implement future phases unless explicitly instructed.

In particular, **Phase 2 must not implement**:

- Route authorization
- UI authorization components (`<Can>`, `<Cannot>`)
- Authorization page metadata
- Nitro authorization guards (`requireAbility`)
- Authorization databases
- Policy engines
- Role-management systems

## Git Safety

Never:

- Reset user work
- Use destructive Git commands
- Overwrite unrelated modifications
- Commit without explicit instruction

## Testing Standards

- Existing test suite must pass
- New tests must be added for behavioral changes
- Do not delete existing tests merely to make the suite pass
- All tests must pass
- Record test count before and after implementation
