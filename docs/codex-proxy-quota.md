# Codex enterprise proxy spend

AI Quota can also show spend or balance from a company Codex / OpenAI-compatible proxy, as long as you expose a small billing endpoint for AI Meter to read.

This is different from personal Codex subscription quota:

- `codex`: personal Codex 5h / weekly rate windows, read from the local Codex app-server.
- `codex_proxy`: company proxy spend or remaining balance, read from a billing endpoint or a local private adapter.

## Configure

If your proxy has a billing endpoint that accepts an API key, add these values to `.env`. Do not commit the real API key.

```bash
CODEX_PROXY_BALANCE_URL=https://proxy.example.com/api/billing/balance
CODEX_PROXY_API_KEY=replace-with-your-proxy-key
CODEX_PROXY_AUTH_HEADER=Authorization
CODEX_PROXY_AUTH_PREFIX=Bearer
CODEX_PROXY_SERVICE_ID=codex_proxy
CODEX_PROXY_SERVICE_NAME=Codex
CODEX_PROXY_ACCOUNT_LABEL=Company proxy
CODEX_PROXY_PLAN_LABEL=API key spend
CODEX_PROXY_CURRENCY=USD

PRIMARY_QUOTA_SERVICE_ID=codex_proxy
QUOTA_MENU_SERVICES=claude,codex_proxy
```

If your proxy can only be queried through a company dashboard, SSO session, or other private workflow, do not put that logic in the open-source bridge. Run a local private adapter instead:

```bash
CODEX_PROXY_BALANCE_URL=http://127.0.0.1:17891/balance
CODEX_PROXY_API_KEY=
```

See [Local private quota adapter](local-private-quota-adapter.md) for the standard response shape and a safe template.

Then start the macOS menu bar app:

```bash
./quota.command
```

The menu bar can show Claude and Codex proxy side by side. Use the `重点显示` submenu in the macOS menu bar dropdown to switch which one is shown in the status bar title. For a monthly spend-limit response it displays values like:

```text
Codex $35.60/$1,000
Claude $35.60/$1,000
```

## Response shape

The bridge auto-detects common fields such as:

- `used`, `spent`, `total_used`, `current_usage_usd`
- `limit`, `quota`, `total_granted`, `hard_limit_usd`
- `remaining`, `balance`, `total_available`, `credit`

If your proxy uses different field names, set JSON paths explicitly:

```bash
CODEX_PROXY_USED_JSON_PATH=data.total_used
CODEX_PROXY_LIMIT_JSON_PATH=data.total_granted
CODEX_PROXY_REMAINING_JSON_PATH=data.total_available
```

For nested or alternative fields, use comma-separated paths:

```bash
CODEX_PROXY_USED_JSON_PATH=data.spend.used,result.billing.used
```

## Test locally

```bash
node scripts/codex-proxy-quota-bridge.mjs --json
```

Expected output:

```json
{
  "serviceId": "codex_proxy",
  "serviceName": "Codex",
  "quotaType": "spend_limit",
  "source": "codex-proxy-api-key",
  "windows": [
    {
      "id": "monthly",
      "label": "本月",
      "usedText": "$35.60 已用",
      "remainingText": "$964.40 剩余",
      "limitText": "$1,000 上限"
    }
  ]
}
```

Post one snapshot to your token-monitor server:

```bash
node scripts/codex-proxy-quota-bridge.mjs --post --json
```

If the same server can reach the proxy endpoint, `/api/quota/refresh` can refresh it directly:

```bash
curl -X POST "$TOKEN_MONITOR_BASE_URL/api/quota/refresh" \
  -H "x-quota-token: $QUOTA_READ_TOKEN" \
  -H "content-type: application/json" \
  -d '{"force":true,"serviceId":"codex_proxy"}'
```

## Non-standard units

Some proxy systems return an internal quota unit instead of dollars. Convert it before display:

```bash
CODEX_PROXY_AMOUNT_DIVISOR=500000
CODEX_PROXY_CURRENCY=USD
```

Use `CODEX_PROXY_AMOUNT_MULTIPLIER` if the returned amount needs multiplication instead.

## Security notes

- Only store the proxy API key in your local `.env` or server environment.
- Do not commit `.env`, cookies, proxy keys, or real billing responses.
- The bridge stores only aggregated spend or balance numbers. It does not collect prompt or response content.
