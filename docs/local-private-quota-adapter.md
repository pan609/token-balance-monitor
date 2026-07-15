# Local private quota adapter

Some company AI proxies do not expose a billing endpoint that can be called directly with the model API key. They may require an internal dashboard token, SSO session, service account, or another private workflow.

AI Meter keeps that private logic out of the open-source codebase. The public bridge only calls a local or remote HTTP endpoint that returns a small, standard JSON payload.

## Shape

Your private adapter should expose:

```text
GET http://127.0.0.1:17891/balance
```

and return:

```json
{
  "ok": true,
  "source": "local-private-adapter",
  "accountLabel": "Company proxy",
  "planLabel": "Monthly spend limit",
  "total_used": 35.6,
  "total_granted": 1000,
  "total_available": 964.4,
  "metadata": {
    "adapter": "private"
  }
}
```

The open-source bridge converts those fields into an AI Quota `spend_limit` snapshot and shows it in the macOS menu bar as:

```text
Codex $35.60/$1,000
```

## Configure AI Meter

Point `codex_proxy` at the private adapter:

```bash
CODEX_PROXY_BALANCE_URL=http://127.0.0.1:17891/balance
CODEX_PROXY_API_KEY=
CODEX_PROXY_SERVICE_ID=codex_proxy
CODEX_PROXY_SERVICE_NAME=Codex
CODEX_PROXY_ACCOUNT_LABEL=Company proxy
CODEX_PROXY_PLAN_LABEL=Monthly spend limit
CODEX_PROXY_CURRENCY=USD

PRIMARY_QUOTA_SERVICE_ID=codex_proxy
QUOTA_MENU_SERVICES=claude,codex_proxy
```

If the private adapter returns different field names, map them with:

```bash
CODEX_PROXY_USED_JSON_PATH=data.spend.used
CODEX_PROXY_LIMIT_JSON_PATH=data.spend.limit
CODEX_PROXY_REMAINING_JSON_PATH=data.spend.remaining
```

## Where to put private code

Keep private adapters outside git:

```text
.local/private-adapters/
~/.ai-meter-private/
```

The repository ignores `.local/`, `.private/`, and `private-adapters/`. Put internal domains, SSO logic, cookies, local token caches, and company-specific endpoint paths there.

## Example

The repo includes a safe template:

```bash
node examples/local-quota-adapter.example.mjs
curl http://127.0.0.1:17891/balance
```

Use it as a starting point, then replace the `fetchUpstreamJSON` mapping with your private logic in an ignored local file.

## Runtime behavior

A good private adapter should:

- cache short-lived dashboard tokens locally;
- refresh the token only when it is close to expiry or the upstream returns 401;
- expose only aggregate spend/limit numbers to AI Meter;
- never log API keys, cookies, dashboard tokens, prompts, or responses;
- run on `127.0.0.1` unless you deliberately need a remote deployment.
