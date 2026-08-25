# Authorization

Phase 2 provides the authorization data model. Phase 3 layers opt-in route and server enforcement on top of it.

## Canonical Model

An ability is a string, for example `campaign.create` or `role:admin`. The canonical session representation is `string[]`. Roles and permissions are backend input formats converted into abilities, not separate stored fields.

## Normalization

`normalizeAuthorizationData(response, options?)` reads `abilities`, `roles`, and `permissions` through configured nested paths; prefixes roles with `role:` by default; filters non-string and blank values; removes duplicates; returns sorted output; and does not mutate the response.

`extractAuthorizationFromResponse` returns `null` when authorization is disabled or no usable data exists. Missing authorization configuration is equivalent to `{ enabled: false }`.

## Flows

Session-establishing login, social login, registration, and OTP handlers extract authorization data before creating a session. Refresh and `me` update abilities when a response supplies them; omission preserves the existing list. Local responses return normalized abilities when available.

The composable applies the same omission policy: an array replaces client abilities, while an omitted or non-array field leaves them unchanged. Logout, failed authentication, and `clearAuthState()` clear abilities.

## Client API

```ts
const auth = useBearerAuth();
auth.can("campaign.create");
auth.cannot("campaign.delete");
auth.abilities.value;
```

Checks are exact string membership. Missing abilities return `false` from `can()` and `true` from `cannot()`.

## UI Authorization Components (Phase 4)

`<Can>` and `<Cannot>` are auto-imported declarative primitives over the same client ability state used by `can()`/`cannot()`:

```vue
<!-- single ability -->
<Can ability="users.delete">Delete</Can>

<!-- every listed ability required (default mode: "all") -->
<Can :abilities="['users.view', 'users.edit']">Edit</Can>

<!-- at least one required -->
<Can :abilities="['reports.view', 'reports.export']" mode="any">Export</Can>

<!-- inverse rendering with optional fallback -->
<Cannot ability="users.delete">
  <template #fallback>Request access</template>
</Cannot>
```

- Props: `ability?: string`, `abilities?: string[]`, `mode?: "all" | "any"`. When both props are provided, `ability` wins.
- Matching is exact string equality using the frozen Phase 3 route/server semantics. An explicit empty `abilities` array — or no props at all — means "no restriction". A provided but non-array `abilities` value fails closed.
- Authorized renders the default slot; unauthorized renders the optional `#fallback` slot or nothing. Denied content is removed from the DOM, not CSS-hidden.
- Evaluation is reactive over `useState("bearer-auth-abilities")`: login, refresh, logout, and session replacement update rendering automatically. The components create no second authorization state and fetch nothing.
- Malformed or missing ability state (`null`, wrong types, empty array) fails closed — identical to `auth.can()`.
- Disabled authorization has no special UI mode: extraction never runs, state stays `null`, so `<Can>` renders fallback/nothing, exactly like `can()`.
- Evaluation is synchronous and deterministic over SSR-transferred state, so server output matches hydration. SPA-only renders briefly show fallback until `fetchUser()` resolves; pair with `auth.ready` for loading UX.
- `<Cannot>` is the exact negation of the same shared evaluator result used by `<Can>` (`evaluateAbilities`); there is no duplicate matching logic.

**UI authorization controls rendering only. It never secures API requests. Your backend must authorize every request it receives.** Rendering a delete button does not authorize `DELETE /api/users/123`.

Authorization directives (`v-can`) are intentionally not provided: they would duplicate `<Can>` and `can()` with weaker TypeScript ergonomics and more complex SSR behavior.

## Server State

When enabled and a session has abilities, middleware sets `event.context.authorization` to `{ abilities, source: "session" }`. It remains separate from `event.context.auth`. When disabled, no authorization state is attached and no enforcement occurs.

## Security

Only derived ability strings cross the authorization boundary. Tokens, passwords, OTPs, and raw backend responses are not stored in authorization state or SSR authorization payloads. The backend must enforce real permissions; client checks are advisory.

## Route Authorization (Phase 3)

Pages opt in via metadata:

```ts
definePageMeta({
  authorization: {
    abilities: ["users.view", "users.edit"],
    mode: "all", // optional; default is "all"
  },
});
```

- Default `mode: "all"` requires every listed ability; `"any"` requires at least one.
- Matching is exact string equality. No wildcards, prefixes, or hierarchy.
- Enforcement runs in the existing global middleware after authentication checks and only when `authorization.enabled` is true (`public.bearerAuth.authorizationEnabled`).
- Unauthenticated users keep the normal login redirect with `?redirect=` preserved.
- Authenticated users without the required abilities are redirected to `redirects.unauthorized`; authentication and authorization failures remain distinct.
- Routes without metadata, and all routes when disabled, behave exactly as before.

Route enforcement protects navigation only. It never authorizes external API calls.

## Server Enforcement (Phase 3)

`requireAbility(event, ability | string[], mode?)` is exported from the dedicated server-only subpath:

```ts
import { requireAbility } from "nuxt-bearer-auth/server";

requireAbility(event, "users.delete");
requireAbility(event, ["users.view", "users.export"]); // all
requireAbility(event, ["reports.view", "reports.export"], "any");
```

- Requires an authenticated session from `event.context.auth` (throws 401 otherwise).
- Throws 403 `Authorization required` when required abilities are missing; matching is exact with `all`/`any` semantics.
- Trusts only server-side session data. Client state, headers, query parameters, and request bodies can never grant authorization.
- On success sets `event.context.authorization = { abilities, source: "session" }` and returns the session.
- Fails closed when the session has no abilities (including when authorization is globally disabled).

The subpath keeps the helper out of client bundles. It does not replace Laravel authorization: a guarded Nuxt route that proxies to `DELETE /campaigns/123` still relies on Laravel to authorize that request.

## Future Scope

Endpoint-source fetching, authorization directives (`v-can` is rejected), role guards, policy engines, authorization databases, wildcards, and Laravel/Spatie-specific behavior remain out of scope.
