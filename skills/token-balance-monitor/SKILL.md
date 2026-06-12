---
name: token-balance-monitor
description: Query AI model provider balances, evaluate low-balance risk, open a Token Balance Monitor dashboard, and report request-level token usage events. Use when an agent needs to check balances for Aliyun, DeepSeek, Volcengine/Doubao, Moonshot/Kimi, SiliconFlow, OpenRouter, or a self-hosted Token Balance Monitor service; when deciding whether to warn about low balance before model calls; or when instrumenting a project to send usage events after model requests.
---

# Token Balance Monitor

Use this skill to work with a self-hosted Token Balance Monitor service from an agent or backend project.

The service has two separate surfaces:

- Read balances from `GET /api/mobile/summary` with `TOKEN_MONITOR_MOBILE_TOKEN`.
- Report request-level token usage to `POST /api/usage/events` with `TOKEN_MONITOR_INGEST_TOKEN`.

Do not ask the user for cloud provider AccessKeys for routine use. Aliyun, Volcengine, DeepSeek, Moonshot, SiliconFlow, and OpenRouter credentials belong in the Token Balance Monitor server `.env`, not in the agent.

## Quick Workflow

1. Check required environment variables:
   - `TOKEN_MONITOR_BASE_URL`, for example `https://balance.example.com/token-monitor`
   - `TOKEN_MONITOR_MOBILE_TOKEN` for balance reads
   - `TOKEN_MONITOR_INGEST_TOKEN` for usage writes
   - optional defaults: `TOKEN_MONITOR_PROJECT_ID`, `TOKEN_MONITOR_ENVIRONMENT`
2. For balance questions, call the bundled script:
   ```bash
   node skills/token-balance-monitor/scripts/token-monitor.mjs balance
   ```
3. For model-call instrumentation, report usage after the provider call succeeds or fails. Usage reporting is best-effort and must not block the business result.
4. For schema details, read `references/api.md`.

## Balance Decisions

When checking whether a model call is safe:

- Prefer `/api/mobile/summary`; it is the smallest read-only API.
- Cache balance checks for 1 to 5 minutes in long-running agents.
- Warn if `primaryIsBelowAlert` is true.
- If the task specifically depends on Aliyun, inspect `providers.aliyun.amount`.
- If balance checking fails, do not leak tokens in logs and do not retry more than twice.
- Do not directly open cloud vendor consoles unless the user explicitly asks.

## Usage Reporting

Report usage after each model request if the application wants request-level observability.

Use stable IDs for aggregation:

- `projectId` for the product or repo
- `environment` for `production`, `staging`, or `localtest`
- `feature` for the stable operation key
- `accountId` for the tenant, organization, workspace, or billing owner
- `actorId` for the user, employee, service account, or scheduled task
- `resourceType` and `resourceId` for the business object

Use names only for display:

- `operationName`
- `accountName`
- `actorName`
- `resourceName`

Never report prompt text, response text, API keys, phone numbers, identity numbers, or other sensitive content. Put safe custom dimensions in `attributes`.

## Script Examples

Query balances:

```bash
TOKEN_MONITOR_BASE_URL=https://balance.example.com/token-monitor \
TOKEN_MONITOR_MOBILE_TOKEN=... \
node skills/token-balance-monitor/scripts/token-monitor.mjs balance
```

Print the dashboard URL:

```bash
TOKEN_MONITOR_BASE_URL=https://balance.example.com/token-monitor \
node skills/token-balance-monitor/scripts/token-monitor.mjs dashboard
```

Report a usage event from a JSON file:

```bash
TOKEN_MONITOR_BASE_URL=https://balance.example.com/token-monitor \
TOKEN_MONITOR_INGEST_TOKEN=... \
node skills/token-balance-monitor/scripts/token-monitor.mjs report ./usage-event.json
```

## References

- `references/api.md`: API fields, event schema, provider IDs, and integration examples.
