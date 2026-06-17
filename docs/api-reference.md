# API Reference

这份文档描述 Token Balance Monitor 对外集成时建议依赖的 HTTP API。它适合后端服务、Agent、自动化脚本、macOS 菜单栏、iPhone App 和 Widget 读取余额摘要或上报请求级 token 用量。

如果你要看接入场景和 Agent 行为建议，请读 [Agent 接入文档](agent-integration.md)。如果你要部署服务，请读 [部署文档](deployment.md)。

## Base URL

本地开发默认地址：

```text
http://127.0.0.1:5173
```

生产环境通常放在自己的域名或反向代理路径下，例如：

```text
https://balance.example.com
https://example.com/token-monitor
```

下文用 `TOKEN_MONITOR_BASE_URL` 表示你的服务地址。

## 鉴权

Token Balance Monitor 把读取和写入分成两个 token。

| 用途 | 环境变量 | 推荐 header | 说明 |
| --- | --- | --- | --- |
| 只读查询余额摘要 | `MOBILE_API_TOKEN` | `Authorization: Bearer <token>` | 给 Agent、iPhone、Widget、macOS 客户端使用 |
| 写入 usage 事件 | `USAGE_INGEST_TOKEN` | `Authorization: Bearer <token>` | 给业务服务或 Agent 在模型请求结束后上报 |
| 只读查询订阅额度摘要 | `QUOTA_READ_TOKEN` | `Authorization: Bearer <token>` | 给 Apple Watch、iPhone 或 Web 读取 Codex / Claude 额度窗口 |
| 写入订阅额度快照 | `QUOTA_INGEST_TOKEN` | `Authorization: Bearer <token>` | 给本机 Codex / Claude Code bridge 上报额度窗口 |

只读查询也支持：

```http
x-mobile-token: <MOBILE_API_TOKEN>
```

usage 上报也支持：

```http
x-usage-token: <USAGE_INGEST_TOKEN>
x-ingest-token: <USAGE_INGEST_TOKEN>
```

订阅额度读取和写入也支持：

```http
x-quota-token: <QUOTA_READ_TOKEN>
x-quota-ingest-token: <QUOTA_INGEST_TOKEN>
```

如果要标记写入 token 的来源，可以额外传：

```http
x-token-id: class-teacher-prod
x-project-id: class-teacher
```

生产环境必须设置强随机 `MOBILE_API_TOKEN`、`USAGE_INGEST_TOKEN`、`QUOTA_READ_TOKEN` 和 `QUOTA_INGEST_TOKEN`。本地开发未设置 token 时，服务只在 `127.0.0.1` 下放宽部分鉴权，方便先看界面和调试。

## 公开集成接口

### GET /api/health

健康检查接口，不需要业务参数。

```bash
curl "$TOKEN_MONITOR_BASE_URL/api/health"
```

返回示例：

```json
{
  "ok": true,
  "now": "2026-06-16T10:30:00.000Z"
}
```

### GET /api/mobile/summary

读取轻量余额摘要。这个接口适合 Agent 决策、iPhone Widget、macOS 菜单栏和自动化脚本。

```bash
curl "$TOKEN_MONITOR_BASE_URL/api/mobile/summary" \
  -H "Authorization: Bearer $TOKEN_MONITOR_MOBILE_TOKEN" \
  -H "Accept: application/json"
```

返回示例：

```json
{
  "ok": true,
  "refreshedAt": "2026-06-16T10:30:00.000Z",
  "totalCny": 54.3,
  "alertThresholdCny": 2,
  "primaryProvider": "aliyun",
  "primaryAmount": 12.62,
  "primaryCurrency": "CNY",
  "primaryIsBelowAlert": false,
  "usage24hCny": 1.47,
  "usageSnapshotCount": 24,
  "usageCoverageMinutes": 1440,
  "providers": {
    "aliyun": {
      "id": "aliyun",
      "name": "阿里云百炼",
      "shortName": "阿里云",
      "amount": 12.62,
      "currency": "CNY",
      "status": "ok",
      "statusLabel": "正常",
      "severity": "ok",
      "message": null,
      "isBelowMobileAlert": false
    }
  }
}
```

建议外部客户端只依赖这些字段：

| 字段 | 说明 |
| --- | --- |
| `ok` | 请求是否成功 |
| `refreshedAt` | 本次余额刷新时间 |
| `totalCny` | 人民币余额合计；非 CNY credits 不会强行混入 |
| `primaryProvider` | 当前重点关注平台 |
| `primaryAmount` / `primaryCurrency` | 重点平台余额和币种 |
| `primaryIsBelowAlert` | 是否低于移动端提醒阈值 |
| `usage24hCny` | 近 24h 余额下降估算；采样不足时可能为 `null` |
| `providers` | 各平台余额明细 |

### PUT /api/mobile/primary-provider

切换重点关注平台。这个接口适合移动端或内部自动化使用。

```bash
curl -X PUT "$TOKEN_MONITOR_BASE_URL/api/mobile/primary-provider" \
  -H "Authorization: Bearer $TOKEN_MONITOR_MOBILE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"providerId":"deepseek"}'
```

请求体：

```json
{
  "providerId": "deepseek"
}
```

支持的 `providerId` 取决于服务端已注册 provider，常见值：

```text
aliyun
deepseek
volcengine
moonshot
siliconflow
openrouter
```

成功返回与 `GET /api/mobile/summary` 相同的摘要结构。

### POST /api/usage/events

写入请求级 token 用量。推荐在业务模型请求结束后异步上报，采用 `report-only` 模式，不代理模型流量。

```bash
curl -X POST "$TOKEN_MONITOR_BASE_URL/api/usage/events" \
  -H "Authorization: Bearer $TOKEN_MONITOR_INGEST_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "aliyun",
    "model": "qwen-plus",
    "projectId": "class-teacher",
    "environment": "production",
    "feature": "chat_completion",
    "operationName": "智能问答",
    "accountId": "org:1",
    "actorId": "user:123",
    "requestId": "req_abc",
    "status": "success",
    "promptTokens": 1200,
    "completionTokens": 340,
    "totalTokens": 1540
  }'
```

请求体可以是三种形式：

```json
{ "provider": "aliyun", "model": "qwen-plus", "totalTokens": 1540 }
```

```json
[
  { "provider": "aliyun", "model": "qwen-plus", "totalTokens": 1540 }
]
```

```json
{
  "events": [
    { "provider": "aliyun", "model": "qwen-plus", "totalTokens": 1540 }
  ]
}
```

每次最多接收 100 条事件。超过上限时，前 100 条会被处理，响应里的 `truncated` 会是 `true`。

响应示例：

```json
{
  "ok": true,
  "accepted": 1,
  "rejected": 0,
  "truncated": false,
  "errors": []
}
```

字段说明：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `provider` | 是 | 模型供应商，例如 `aliyun`、`deepseek`、`volcengine` |
| `model` | 是 | 实际调用的模型名 |
| `projectId` | 建议 | 产品或项目 ID，默认 `default` |
| `environment` | 建议 | `production`、`staging`、`localtest`，默认 `production` |
| `feature` | 建议 | 稳定机器 key，例如 `chat_completion`，默认 `default` |
| `operationName` | 可选 | 人可读操作名 |
| `accountId` | 建议 | 费用归属方 ID，默认 `default` |
| `accountName` | 可选 | 费用归属方展示名 |
| `actorId` | 建议 | 触发人 ID |
| `actorName` | 可选 | 触发人展示名 |
| `resourceType` | 可选 | 业务对象类型 |
| `resourceId` | 可选 | 业务对象 ID |
| `resourceName` | 可选 | 业务对象展示名 |
| `requestId` | 建议 | 本次模型请求唯一 ID；不传会自动生成 |
| `upstreamRequestId` | 可选 | 上游模型平台返回的请求 ID |
| `status` | 建议 | `success` 或 `error`，默认 `success` |
| `promptTokens` / `inputTokens` | 建议 | 输入 token |
| `completionTokens` / `outputTokens` | 建议 | 输出 token |
| `cachedTokens` | 可选 | 命中缓存的 token |
| `reasoningTokens` | 可选 | 推理 token |
| `totalTokens` | 建议 | 总 token；不传时会尝试由输入、输出、推理 token 相加 |
| `estimatedCost` / `cost` | 可选 | 业务侧估算成本 |
| `currency` | 可选 | 成本币种，默认 `CNY` |
| `startedAt` | 建议 | 模型请求开始时间 |
| `durationMs` / `latencyMs` | 可选 | 请求耗时 |
| `attributes` | 可选 | 业务自定义维度，最多保留 48 个 key |
| `metadata` | 可选 | 附加排查信息，最多保留 24 个 key |
| `rawUsage` / `usage` | 可选 | 上游 SDK 原始 usage 摘要 |

兼容 OpenAI-compatible usage 字段：

```json
{
  "provider": "deepseek",
  "model": "deepseek-chat",
  "usage": {
    "prompt_tokens": 1200,
    "completion_tokens": 340,
    "total_tokens": 1540
  }
}
```

### GET /api/quota/summary

读取 Codex / Claude Code 这类订阅额度窗口的最新快照。这个接口和模型平台余额不是同一类数据：它回答的是 5 小时、每周等订阅周期里还剩多少可用空间。

```bash
curl "$TOKEN_MONITOR_BASE_URL/api/quota/summary" \
  -H "Authorization: Bearer $QUOTA_READ_TOKEN" \
  -H "Accept: application/json"
```

返回示例：

```json
{
  "ok": true,
  "refreshedAt": "2026-06-17T02:30:00.000Z",
  "staleSeconds": 120,
  "warningRemainingPercent": 20,
  "criticalRemainingPercent": 8,
  "primaryServiceId": "codex",
  "primaryService": {
    "serviceId": "codex",
    "serviceName": "Codex",
    "planLabel": "Codex",
    "source": "codex-app-server",
    "fetchedAt": "2026-06-17T02:29:30.000Z",
    "isStale": false,
    "status": "ok",
    "statusLabel": "充足",
    "windows": [
      {
        "id": "5h",
        "label": "5 小时",
        "usedPercent": 42,
        "remainingPercent": 58,
        "resetsAt": "2026-06-17T05:00:00.000Z",
        "status": "ok",
        "statusLabel": "充足"
      }
    ]
  },
  "services": []
}
```

建议外部客户端只依赖这些字段：

| 字段 | 说明 |
| --- | --- |
| `primaryServiceId` | 当前重点关注服务，例如 `codex` 或 `claude` |
| `services` | 所有服务的最新额度快照 |
| `windows[].remainingPercent` | 当前窗口剩余百分比 |
| `windows[].resetsAt` | 窗口重置时间，可能为 `null` |
| `isStale` | 数据是否超过 `QUOTA_STALE_SECONDS` |
| `status` / `statusLabel` | `ok`、`warning`、`critical`、`stale` 等状态 |

### POST /api/quota/refresh

请求服务端尽量刷新一次订阅额度，然后返回与 `GET /api/quota/summary` 相同的摘要结构。这个接口适合 Apple Watch App 前台打开或用户手动刷新时调用。

```bash
curl -X POST "$TOKEN_MONITOR_BASE_URL/api/quota/refresh" \
  -H "Authorization: Bearer $QUOTA_READ_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"force":true,"serviceId":"codex"}'
```

注意：

- Codex 只有在服务端运行环境能访问本机 Codex app-server 时，才可能实时刷新。
- Claude Code 推荐通过 status line bridge 上报，云端 `refresh` 通常只能返回最近快照。
- 上一次刷新距离太近时，服务端可能返回 `liveRefresh.skipped = true`，用来保护本机读取频率。

### POST /api/quota/snapshots

写入订阅额度窗口快照。这个接口给本机 bridge 使用，例如 `scripts/codex-quota-bridge.mjs` 或 `scripts/quota-statusline-bridge.mjs`。

```bash
curl -X POST "$TOKEN_MONITOR_BASE_URL/api/quota/snapshots" \
  -H "Authorization: Bearer $QUOTA_INGEST_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "serviceId": "claude",
    "serviceName": "Claude",
    "planLabel": "Claude Code",
    "source": "claude-statusline",
    "fetchedAt": "2026-06-17T02:30:00.000Z",
    "windows": [
      {
        "id": "5h",
        "label": "5 小时",
        "usedPercent": 37,
        "remainingPercent": 63,
        "resetsAt": "2026-06-17T05:00:00.000Z"
      },
      {
        "id": "weekly",
        "label": "每周",
        "usedPercent": 52,
        "remainingPercent": 48
      }
    ]
  }'
```

响应示例：

```json
{
  "ok": true,
  "accepted": 1,
  "rejected": 0,
  "errors": []
}
```

字段说明：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `serviceId` | 是 | 稳定服务 ID，例如 `codex`、`claude` |
| `serviceName` | 建议 | 展示名 |
| `accountLabel` | 可选 | 账号或订阅标签 |
| `planLabel` | 可选 | 套餐或来源标签 |
| `source` | 建议 | `codex-app-server`、`claude-statusline`、`manual` 等 |
| `fetchedAt` | 建议 | 快照实际读取时间 |
| `windows` | 是 | 一个或多个额度窗口 |
| `windows[].id` | 是 | `5h`、`weekly` 等窗口 ID |
| `windows[].usedPercent` | 建议 | 已用百分比 |
| `windows[].remainingPercent` | 建议 | 剩余百分比；不传时会尝试由 `usedPercent` 计算 |
| `windows[].resetsAt` | 可选 | 窗口重置时间 |

订阅额度接口不接收 prompt、response、Claude 登录态、OpenAI 登录态或浏览器 cookie。

## Dashboard 读取接口

下面这些接口主要给 Web Dashboard 使用。外部系统可以读取，但不要把它们当成最小接入依赖。

| 接口 | 用途 |
| --- | --- |
| `GET /api/balances` | 刷新并读取完整余额看板数据 |
| `GET /api/usage/hourly?hours=24` | 读取余额历史推算的小时消耗 |
| `GET /api/usage/recent?limit=20` | 读取最近 usage 事件 |
| `GET /api/usage/events` | 分页读取 usage 事件列表 |
| `GET /api/usage/overview` | 读取 usage 汇总指标 |
| `GET /api/usage/timeline` | 读取 usage 时间线 |
| `GET /api/usage/stats?groupBy=projectId` | 按字段聚合 usage |
| `GET /api/usage/breakdown?groupBy=model` | 读取 breakdown 数据 |

常见筛选参数：

```text
hours
since
until
provider
model
projectId
environment
accountId
actorId
feature
resourceType
status
userHash
q
attributes.<key>
attr.<key>
```

聚合字段支持：

```text
provider
model
projectId
environment
accountId
actorId
userHash
feature
resourceType
```

## CORS

`POST /api/usage/events`、`POST /api/quota/snapshots` 和 `POST /api/quota/refresh` 支持按环境变量配置跨域：

```bash
USAGE_INGEST_CORS_ORIGIN=https://your-app.example.com
```

启用后，服务会允许：

```text
POST, OPTIONS
content-type, authorization, x-usage-token, x-ingest-token, x-quota-token, x-quota-ingest-token, x-token-id, x-project-id, x-service-id
```

如果业务服务和 Token Balance Monitor 都在服务端，优先使用服务端到服务端调用，不需要浏览器跨域。

## 错误响应

常见错误：

| 状态码 | 示例 message | 说明 |
| --- | --- | --- |
| `400` | `provider is required` | usage 事件字段不完整或格式错误 |
| `400` | `serviceId is required` | quota 快照缺少服务 ID |
| `400` | `codex: windows is required` | quota 快照缺少额度窗口 |
| `400` | `Unknown provider id` | 切换重点平台时传入了未知 provider |
| `401` | `Missing or invalid mobile token` | 只读查询 token 缺失或错误 |
| `401` | `Missing or invalid usage ingest token` | usage 写入 token 缺失或错误 |
| `401` | `Missing or invalid quota read token` | quota 只读 token 缺失或错误 |
| `401` | `Missing or invalid quota ingest token` | quota 写入 token 缺失或错误 |
| `500` | `Failed to update primary provider` | 服务端写入配置失败 |

usage 上报建议做 best-effort：上报失败不应该影响原本的模型请求结果。

## 隐私边界

Token Balance Monitor 的 usage 事件只需要定位成本和排查所需的结构化字段。

不要上报：

- prompt 原文
- response 原文
- 用户手机号、身份证、邮箱等直接敏感信息
- 云厂商 AccessKey、API Key、Session Token
- 完整业务对象内容

推荐上报：

- `provider`
- `model`
- `projectId`
- `environment`
- `feature`
- `accountId`
- `actorId` 或 `userHash`
- `resourceType`
- `resourceId`
- `requestId`
- token 数和耗时

## JavaScript 示例

直接 `fetch` 上报：

```js
export async function reportUsage(event) {
  try {
    await fetch(`${process.env.TOKEN_MONITOR_BASE_URL}/api/usage/events`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env.TOKEN_MONITOR_INGEST_TOKEN}`
      },
      body: JSON.stringify(event)
    });
  } catch {
    // usage 上报失败不影响业务请求。
  }
}
```

读取余额摘要：

```js
export async function getBalanceSummary() {
  const response = await fetch(`${process.env.TOKEN_MONITOR_BASE_URL}/api/mobile/summary`, {
    headers: {
      accept: "application/json",
      authorization: `Bearer ${process.env.TOKEN_MONITOR_MOBILE_TOKEN}`
    }
  });

  if (!response.ok) {
    throw new Error(`Token Monitor request failed: ${response.status}`);
  }

  return response.json();
}
```
