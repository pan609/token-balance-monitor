# Scoped Usage Query Authentication

Public usage queries are independent from ingest, mobile balance and quota credentials.
Local-only installations retain their existing behavior unless authentication is enabled.
No dependency, event schema, data retention or model-provider change is required.

## Server Configuration

Set these in a root-only systemd EnvironmentFile, referenced by a dedicated service drop-in:

```dotenv
USAGE_READ_AUTH_REQUIRED=true
USAGE_READ_REQUIRE_HTTPS=true
USAGE_READ_TOKENS='{"dashboard-staging":{"token":"REPLACE_WITH_A_UNIQUE_BASE64URL_READ_TOKEN","projectId":"your-project","environments":["staging"]}}'
```

Generate an independent random secret, not the literal example. Tokens must use base64url
characters and be 32-256 characters long. Reusing ingest, mobile, quota or another reader
credential is rejected at startup. Missing or invalid required policies fail startup instead
of falling back to anonymous reads. Unknown nonempty authentication mode values also fail.

Use `systemctl daemon-reload`, verify the dedicated file appears in `DropInPaths`, then restart
the monitor. Do not log environment values or print the policy when testing. A service restart
has a short telemetry availability window; it is not a zero-downtime deployment.

## Scope and Transport

- GET/HEAD `/api/usage/*` require the independent Bearer credential over verified HTTPS.
- A scoped reader can only access `/api/usage/events` with explicit, scalar `projectId` and
  `environment` matching its policy. Missing, duplicate or conflicting filters return 403.
- Legacy unfiltered recent/stats/hourly/overview/timeline/breakdown routes return 403 to
  scoped readers. Anonymous and wrong credentials return 401. Responses are private/no-store.
- HTTP queries return 426 before token comparison. Never send a real token to test HTTP.
- Only a loopback reverse proxy may assert an exact `X-Forwarded-Proto: https`. Every public
  proxy must overwrite that header from its actual TLS state, never forward client input.
  Keep Node listening on loopback; audit every proxy alias and public raw port.
- POST event ingest retains its separate authorization. A read credential cannot ingest.
  Existing mobile/quota routes retain their own authorization and semantics.

The former anonymous monitor Web usage page becomes unavailable by design. Its unfiltered
requests cannot remain open as a bypass. A general authenticated operator UI is separate work;
an authorized consumer should paginate scoped events and aggregate them itself. This does not
claim that unrelated balance or quota APIs were redesigned or comprehensively hardened.

## Acceptance and Recovery

Test valid TLS, anonymous/wrong/ingest query rejection, valid scoped reads, project/environment
denial, repeated query parameters, HEAD/case/trailing-slash behavior, and reader write rejection.
Test old HTTP with a fictitious credential and spoofed forwarding headers. Use fixed `since`
and `until` bounds when reconciling pages, since new events may arrive during pagination.

Back up the entry and configuration before installation and verify source hashes. Do not
overwrite the server's existing environment or update unrelated dependencies. If the new guard
cannot be validated, fail usage reads closed (503) while preserving ingest authorization;
check syntax, restart success, health, and an actual anonymous 503 before reporting recovery.
Never restore anonymous access automatically. Retained root-only inactive credentials require
inspection before any retry; do not blindly rerun a credential-creation script.

Reported attribution relies on trusted ingest writers. Missing, overwritten or expired events
cannot be reconstructed. Keep unknown usage/prices separate from zero and provider billing.

## Checks

```sh
node --test server/usage-read-auth.test.mjs server/usage-read-auth.integration.test.mjs
npm run check
```

These use fictitious credentials and an ephemeral loopback Express server. They do not call
models or write production event data. Live deployment and scoped consumer integration need
separate authorization and evidence.
