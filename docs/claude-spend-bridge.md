# Claude spend bridge

This bridge lets AI Quota read the aggregated spend data shown on `claude.ai/settings/usage`.
It stores the Claude cookie in macOS Keychain, converts Claude's `spend` response into the same quota snapshot format used by Codex, and can write that snapshot to your own token-monitor server.

It does not store prompt or response content. It only records an aggregated spend window such as used amount, limit amount, remaining percent, reset time, source, and fetch time.

## When to use it

Use this if you want AI Quota to show Claude subscription / usage spend next to Codex quota data.

Use `docs/claude-code-quota.md` instead if your data source is Claude Code status line output rather than claude.ai billing usage.

## Install dependencies

The bridge is a small Node wrapper around a Python fetcher. Create a local Python environment and install the Claude-only dependencies:

```bash
python3 -m venv .venv-claude
./.venv-claude/bin/pip install -r requirements-claude.txt
```

Then point the bridge at that Python runtime:

```bash
export CLAUDE_QUOTA_PYTHON="$PWD/.venv-claude/bin/python"
```

If you already have another Python environment with `curl_cffi` and `keyring`, set `CLAUDE_QUOTA_PYTHON` to that interpreter.

## Configure Claude access

Add these values to your local `.env` or shell profile. Do not commit the real values.

```bash
CLAUDE_ORG_UUID=
CLAUDE_KEYRING_SERVICE=token-balance-monitor-claude
CLAUDE_KEYRING_KEY=cookie
CLAUDE_QUOTA_ACCOUNT_LABEL=Claude
CLAUDE_QUOTA_PLAN_LABEL=claude.ai usage
```

`CLAUDE_ORG_UUID` is the organization id from the claude.ai usage request URL:

```text
https://claude.ai/api/organizations/<CLAUDE_ORG_UUID>/usage
```

To find it, open Claude usage in the browser, inspect network requests, and copy the UUID from the usage API URL.

Store the cookie in macOS Keychain:

```bash
node scripts/claude-quota-bridge.mjs --set-cookie
```

Paste the full Cookie header value from a logged-in claude.ai usage request. The cookie is written to Keychain under `CLAUDE_KEYRING_SERVICE` / `CLAUDE_KEYRING_KEY`; it is not written to this repository.

## Test locally

```bash
node scripts/claude-quota-bridge.mjs --json
```

Expected shape:

```json
{
  "serviceId": "claude",
  "serviceName": "Claude",
  "windows": [
    {
      "id": "monthly",
      "label": "本月",
      "usedPercent": 2.1,
      "remainingPercent": 97.9
    }
  ]
}
```

Use `--raw` when you need to inspect the claude.ai response shape:

```bash
node scripts/claude-quota-bridge.mjs --raw
```

## Write to your token-monitor server

Configure the quota snapshot ingest endpoint:

```bash
export QUOTA_INGEST_URL="https://your-domain.example/api/quota/snapshots"
export QUOTA_INGEST_TOKEN="replace-with-a-long-random-token"
```

Post one snapshot:

```bash
node scripts/claude-quota-bridge.mjs --post --json
```

If your token-monitor server is running on the same Mac and has access to this bridge, `/api/quota/refresh` can collect Claude directly:

```bash
curl -X POST "$TOKEN_MONITOR_BASE_URL/api/quota/refresh" \
  -H "x-quota-token: $QUOTA_READ_TOKEN" \
  -H "content-type: application/json" \
  -d '{"force":true,"serviceId":"claude"}'
```

## Refresh schedule

For a self-hosted setup, run the bridge on the computer that has the Claude cookie:

```bash
*/5 * * * * cd /path/to/token-balance-monitor && CLAUDE_QUOTA_PYTHON="$PWD/.venv-claude/bin/python" node scripts/claude-quota-bridge.mjs --post >/tmp/token-monitor-claude.log 2>&1
```

If you need fresher Watch / iPhone data, shorten the schedule, but avoid hammering the unofficial claude.ai endpoint.

## macOS menu bar

Use the standalone AI Quota menu bar app when you want Claude spend visible while coding:

```bash
PRIMARY_QUOTA_SERVICE_ID=claude
QUOTA_MENU_SERVICES=claude,codex
./quota.command
```

`quota.command` is separate from the AI Balance pet. It can show `Claude $35.60/$1000` for `spend_limit` snapshots or `Codex 5 小时 72%` for `rate_window` snapshots.

If your Codex data comes from a company proxy API key instead of the local personal Codex app-server, use `codex_proxy`:

```bash
PRIMARY_QUOTA_SERVICE_ID=codex_proxy
QUOTA_MENU_SERVICES=claude,codex_proxy
./quota.command
```

See [Codex enterprise proxy spend](codex-proxy-quota.md).

If you intentionally want the AI Balance pet to include quota data as an advanced mixed view, opt in explicitly:

```bash
PET_QUOTA_REFRESH_SERVICE_ID=claude
```

Without that variable, `./pet.command` stays focused on provider credits and will not mix Claude / Codex subscription quota into the Balance menu.

## Caveats

- This uses an unofficial claude.ai web endpoint. Anthropic may change the response shape or bot checks.
- The cookie expires. Re-run `node scripts/claude-quota-bridge.mjs --set-cookie` when reads start returning 401 / 403.
- A cloud server cannot read a cookie stored only on your Mac. Either run the bridge on your Mac and post snapshots, or configure the cookie on the server's own Keychain-compatible environment.
- Only aggregated spend data is stored. Prompt text, response text, and request bodies are not collected.
