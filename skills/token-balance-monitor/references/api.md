# Token Balance Monitor API Reference

Use this reference when an agent needs exact API fields or event shapes.

## Environment Variables

```bash
TOKEN_MONITOR_BASE_URL=https://balance.example.com/token-monitor
TOKEN_MONITOR_MOBILE_TOKEN=read-token
TOKEN_MONITOR_INGEST_TOKEN=write-token
TOKEN_MONITOR_PROJECT_ID=my-project
TOKEN_MONITOR_ENVIRONMENT=production
```

`TOKEN_MONITOR_MOBILE_TOKEN` is read-only for balance summaries. `TOKEN_MONITOR_INGEST_TOKEN` is write-only for usage events.

## Balance Summary

```http
GET /api/mobile/summary
Authorization: Bearer TOKEN_MONITOR_MOBILE_TOKEN
Accept: application/json
```

Important response fields:

| Field | Meaning |
| --- | --- |
| `ok` | Whether the service returned a valid summary |
| `totalCny` | Total CNY balance across CNY providers |
| `primaryProvider` | User-selected focused provider |
| `primaryAmount` | Focused provider balance |
| `primaryCurrency` | Focused provider currency |
| `primaryIsBelowAlert` | Whether focused provider is below alert threshold |
| `usage24hCny` | Estimated 24h spend from balance snapshots, if available |
| `providers` | Provider map keyed by provider id |

Common provider ids:

| Provider | ID |
| --- | --- |
| Aliyun Bailian | `aliyun` |
| DeepSeek | `deepseek` |
| Volcengine / Doubao | `volcengine` |
| Moonshot / Kimi | `moonshot` |
| SiliconFlow | `siliconflow` |
| OpenRouter | `openrouter` |

## Usage Event Ingest

```http
POST /api/usage/events
Authorization: Bearer TOKEN_MONITOR_INGEST_TOKEN
Content-Type: application/json
```

Request body may be a single event or `{ "events": [event] }`.

Minimal event:

```json
{
  "projectId": "my-product",
  "environment": "production",
  "provider": "aliyun",
  "model": "qwen-plus",
  "feature": "chat_completion",
  "operationName": "Chat completion",
  "accountId": "workspace:1",
  "actorId": "user:123",
  "requestId": "req_abc",
  "status": "success",
  "promptTokens": 1200,
  "completionTokens": 340,
  "totalTokens": 1540,
  "startedAt": "2026-06-12T10:26:50Z",
  "durationMs": 1800
}
```

Full event with business dimensions:

```json
{
  "projectId": "class-teacher",
  "environment": "production",
  "provider": "volc",
  "model": "doubao-1-5-vision-pro-32k-250115",
  "feature": "wrong_question_ocr",
  "operationName": "上传错题",
  "accountId": "org:1",
  "accountName": "默认机构",
  "actorId": "7",
  "actorName": "潘老师",
  "resourceType": "wrong_question",
  "resourceId": "88",
  "resourceName": "李明汐的数学错题",
  "requestId": "req_abc",
  "status": "success",
  "promptTokens": 1200,
  "completionTokens": 340,
  "reasoningTokens": 0,
  "totalTokens": 1540,
  "startedAt": "2026-06-12T10:26:50Z",
  "durationMs": 1800,
  "attributes": {
    "classId": 2,
    "studentId": 3,
    "subject": "数学",
    "source": "questions_upload"
  }
}
```

The full event above is only an example from one education product. Other projects should replace IDs and names with their own product, tenant, actor, and resource fields.

## Field Rules

| Field | Required | Rule |
| --- | --- | --- |
| `provider` | yes | Provider id or provider family used for the model call |
| `model` | yes | Actual model name sent to the provider |
| `projectId` | recommended | Stable product/project id |
| `environment` | recommended | `production`, `staging`, or `localtest` |
| `feature` | recommended | Stable machine key for aggregation |
| `operationName` | recommended | Human-readable operation label |
| `accountId` | recommended | Billing owner, tenant, org, team, or workspace id |
| `actorId` | recommended | User, employee, service account, or scheduled task id |
| `resourceType` | optional | Business object type |
| `resourceId` | optional | Business object id |
| `requestId` | recommended | Unique request id for troubleshooting |
| `status` | recommended | `success` or `error` |
| `promptTokens` | recommended | Input tokens |
| `completionTokens` | recommended | Output tokens |
| `reasoningTokens` | optional | Reasoning tokens |
| `totalTokens` | recommended | Total tokens |
| `attributes` | optional | Safe custom dimensions for filtering and display |

Aggregate by IDs, not names. Names are display-only.

## Compatibility

Legacy fields are accepted:

```text
userId -> actorId
userLabel -> actorName
featureLabel -> operationName
metadata.usage_context -> attributes
```

## Safety Rules

- Do not send prompt or response bodies.
- Do not send API keys or cloud credentials.
- Do not send sensitive user data.
- Treat usage ingest as best-effort; failures must not break business model calls.
- Log only status codes and request ids, not bearer tokens.
