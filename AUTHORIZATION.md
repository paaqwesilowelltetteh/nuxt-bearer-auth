# Authorization Foundation

Phase 2 provides authorization data plumbing only. It does not enforce authorization.

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

## Server State

When enabled and a session has abilities, middleware sets `event.context.authorization` to `{ abilities, source: "session" }`. It remains separate from `event.context.auth`. When disabled, no authorization state is attached and no enforcement occurs.

## Security

Only derived ability strings cross the authorization boundary. Tokens, passwords, OTPs, and raw backend responses are not stored in authorization state or SSR authorization payloads. The backend must enforce real permissions; client checks are advisory.

## Future Scope

Endpoint-source fetching, route metadata, route middleware, UI components/directives, `requireAbility`, role guards, policy engines, authorization databases, wildcards, and Laravel/Spatie-specific behavior are outside Phase 2.
