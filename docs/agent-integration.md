# Agent 接入文档

这份文档面向业务项目里的 Agent、后端服务或自动化脚本。接入目标有两个：

- 查询当前模型平台余额，决定是否继续执行、提醒充值或切换模型。
- 在每次模型调用结束后，上报请求级 token 用量，方便在 AI Balance 看板里追踪消耗来源。

生产环境推荐使用自托管服务，例如：

```text
https://balance.example.com/token-monitor
```

下文用 `TOKEN_MONITOR_BASE_URL` 表示这个地址。

## 1. Agent 需要的环境变量

业务 Agent 不应该持有阿里云、火山、DeepSeek 等云厂商密钥。云厂商密钥只放在 AI Meter 服务端 `.env`。

Agent 只需要下面这些配置：

```bash
TOKEN_MONITOR_BASE_URL=https://balance.example.com/token-monitor

# 查询移动端/轻量摘要接口使用。只读。
TOKEN_MONITOR_MOBILE_TOKEN=replace-with-mobile-api-token

# 上报请求级 token 用量使用。只写。
TOKEN_MONITOR_INGEST_TOKEN=replace-with-usage-ingest-token

TOKEN_MONITOR_PROJECT_ID=your-project
TOKEN_MONITOR_ENVIRONMENT=production
```

建议把 `TOKEN_MONITOR_MOBILE_TOKEN` 和 `TOKEN_MONITOR_INGEST_TOKEN` 分开。这样即使某个业务服务只需要上报 usage，也不必拥有读取余额的权限。

## 2. 查询余额

### 2.1 推荐接口：轻量摘要

用于 Agent 决策、iPhone 小组件、状态栏这类场景。

```http
GET /api/mobile/summary
Authorization: Bearer TOKEN_MONITOR_MOBILE_TOKEN
Accept: application/json
```

示例：

```bash
curl "$TOKEN_MONITOR_BASE_URL/api/mobile/summary" \
  -H "Authorization: Bearer $TOKEN_MONITOR_MOBILE_TOKEN" \
  -H "Accept: application/json"
```

典型返回：

```json
{
  "ok": true,
  "refreshedAt": "2026-06-12T10:30:00.000Z",
  "totalCny": 24.49,
  "alertThresholdCny": 2,
  "primaryProvider": "aliyun",
  "primaryAmount": 7.96,
  "primaryCurrency": "CNY",
  "primaryIsBelowAlert": false,
  "usage24hCny": 1.46,
  "providers": {
    "aliyun": {
      "id": "aliyun",
      "name": "阿里云百炼",
      "amount": 7.96,
      "currency": "CNY",
      "status": "ok",
      "severity": "ok"
    }
  }
}
```

Agent 建议只依赖这些字段：

| 字段 | 用途 |
| --- | --- |
| `ok` | 接口是否正常 |
| `totalCny` | 人民币平台余额合计 |
| `primaryProvider` | 当前重点关注平台 |
| `primaryAmount` | 重点关注平台余额 |
| `primaryIsBelowAlert` | 是否低于提醒阈值 |
| `providers` | 各平台余额明细 |

### 2.2 何时查余额

建议策略：

- Agent 启动时查一次。
- 长任务开始前查一次。
- 每隔 1 到 5 分钟最多查一次，不要每个模型请求前都查。
- 如果 `primaryIsBelowAlert=true`，Agent 应提醒用户充值或切换模型。
- 如果查询失败，不要直接中断业务模型请求；除非你的业务明确要求“余额不可确认时禁止调用”。

### 2.3 平台 ID

常见平台 ID：

| 平台 | provider id |
| --- | --- |
| 阿里云百炼 | `aliyun` |
| DeepSeek | `deepseek` |
| 火山引擎 / 豆包 | `volcengine` |
| Kimi / Moonshot | `moonshot` |
| 硅基流动 | `siliconflow` |
| OpenRouter | `openrouter` |

如果 Agent 只关心阿里云，可以读取：

```js
const aliyun = summary.providers?.aliyun;
```

## 3. 上报请求级 Token

余额查询只能知道“钱少了多少”。如果要知道“哪次请求、哪个用户、哪个业务对象花了多少 token”，业务 Agent 需要在模型调用结束后上报 usage。

上报接口：

```http
POST /api/usage/events
Authorization: Bearer TOKEN_MONITOR_INGEST_TOKEN
Content-Type: application/json
```

推荐使用 `report-only` 模式：

```text
业务 Agent -> 模型平台
业务 Agent -> Token Monitor /api/usage/events
```

上报失败不能影响原本的模型请求结果。也就是说，usage 上报应该是 best-effort。

## 4. 标准事件字段

下面只是一个业务项目示例，用的是你当前的错题识别场景。其他项目可以替换成自己的 `projectId`、`feature`、`accountId`、`actorId` 和资源字段，只要保留通用字段语义即可。

最小可用事件示例：

```json
{
  "projectId": "class-teacher",
  "environment": "production",
  "provider": "volc",
  "model": "doubao-1-5-vision-pro-32k-250115",
  "feature": "wrong_question_ocr",
  "operationName": "上传错题",
  "accountId": "org:1",
  "actorId": "7",
  "requestId": "req_abc",
  "status": "success",
  "promptTokens": 1200,
  "completionTokens": 340,
  "totalTokens": 1540,
  "startedAt": "2026-06-12T10:26:50Z",
  "durationMs": 1800
}
```

推荐完整事件示例：

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

字段规则：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `projectId` | 建议 | 产品或项目 ID，用于聚合 |
| `environment` | 建议 | `production` / `staging` / `localtest` |
| `provider` | 是 | 模型供应商，例如 `aliyun`、`volc`、`deepseek` |
| `model` | 是 | 实际调用的模型名 |
| `feature` | 建议 | 稳定机器 key，例如 `wrong_question_ocr` |
| `operationName` | 建议 | 人可读名称，例如 `上传错题` |
| `accountId` | 建议 | 费用归属方 ID，例如机构、团队、租户 |
| `accountName` | 可选 | 费用归属方展示名 |
| `actorId` | 建议 | 触发人 ID，可以是用户、员工、系统任务 |
| `actorName` | 可选 | 触发人展示名 |
| `resourceType` | 可选 | 业务对象类型 |
| `resourceId` | 可选 | 业务对象 ID |
| `resourceName` | 可选 | 业务对象展示名 |
| `requestId` | 建议 | 本次模型请求唯一 ID，用于排查 |
| `status` | 建议 | `success` 或 `error` |
| `promptTokens` | 建议 | 输入 token |
| `completionTokens` | 建议 | 输出 token |
| `reasoningTokens` | 可选 | 推理 token |
| `totalTokens` | 建议 | 总 token |
| `startedAt` | 建议 | 模型请求开始时间 |
| `durationMs` | 可选 | 请求耗时 |
| `attributes` | 可选 | 业务自定义维度 |

聚合永远使用 ID 字段，不使用 name 字段。比如按账号聚合用 `accountId`，按触发人聚合用 `actorId`。名称只负责展示。

## 5. JavaScript 接入示例

如果你的 Agent 使用 OpenAI-compatible SDK，可以直接复用项目里的轻量 SDK。

```js
import {
  TokenBalanceMonitor,
  usageFromOpenAICompatible
} from "./sdk/javascript/index.js";

const monitor = new TokenBalanceMonitor({
  endpoint: `${process.env.TOKEN_MONITOR_BASE_URL}/api/usage/events`,
  token: process.env.TOKEN_MONITOR_INGEST_TOKEN,
  projectId: process.env.TOKEN_MONITOR_PROJECT_ID,
  environment: process.env.TOKEN_MONITOR_ENVIRONMENT || "production",
  accountId: "org:1",
  accountName: "默认机构"
});

async function callModelWithUsageReport({ client, payload, user, resource }) {
  const startedAt = Date.now();
  const requestId = crypto.randomUUID();

  try {
    const result = await client.chat.completions.create(payload);

    monitor.report({
      provider: "aliyun",
      model: payload.model,
      feature: "chat_completion",
      operationName: "智能问答",
      actorId: String(user.id),
      actorName: user.name,
      resourceType: resource.type,
      resourceId: String(resource.id),
      resourceName: resource.name,
      requestId,
      status: "success",
      startedAt: new Date(startedAt).toISOString(),
      durationMs: Date.now() - startedAt,
      attributes: {
        source: "agent",
        workspaceId: resource.workspaceId
      },
      ...usageFromOpenAICompatible(result)
    });

    return result;
  } catch (error) {
    monitor.report({
      provider: "aliyun",
      model: payload.model,
      feature: "chat_completion",
      operationName: "智能问答",
      actorId: String(user.id),
      actorName: user.name,
      requestId,
      status: "error",
      startedAt: new Date(startedAt).toISOString(),
      durationMs: Date.now() - startedAt,
      metadata: {
        errorName: error.name,
        errorMessage: error.message
      }
    });

    throw error;
  }
}
```

进程退出前可以主动 flush：

```js
await monitor.flush();
```

## 6. 不使用 SDK 的直接上报示例

```js
async function reportUsageEvent(event) {
  try {
    await fetch(`${process.env.TOKEN_MONITOR_BASE_URL}/api/usage/events`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env.TOKEN_MONITOR_INGEST_TOKEN}`
      },
      body: JSON.stringify({ events: [event] })
    });
  } catch {
    // usage 上报失败不影响业务请求。
  }
}
```

## 7. 查询余额示例

```js
async function getTokenBalanceSummary() {
  const response = await fetch(`${process.env.TOKEN_MONITOR_BASE_URL}/api/mobile/summary`, {
    headers: {
      accept: "application/json",
      authorization: `Bearer ${process.env.TOKEN_MONITOR_MOBILE_TOKEN}`
    }
  });

  if (!response.ok) {
    throw new Error(`Token Monitor balance query failed: ${response.status}`);
  }

  return response.json();
}

async function shouldWarnBeforeLongTask() {
  const summary = await getTokenBalanceSummary();
  const aliyun = summary.providers?.aliyun;

  return {
    totalCny: summary.totalCny,
    primaryProvider: summary.primaryProvider,
    primaryAmount: summary.primaryAmount,
    aliyunAmount: aliyun?.amount,
    shouldWarn: summary.primaryIsBelowAlert || Number(aliyun?.amount) < 2
  };
}
```

## 8. Agent 行为建议

建议给 Agent 加上这段规则：

```text
你可以通过 AI Balance 查询模型平台余额。
查询余额时调用 GET {TOKEN_MONITOR_BASE_URL}/api/mobile/summary，并携带 Bearer TOKEN_MONITOR_MOBILE_TOKEN。
余额查询失败时，不要泄露 token，不要重试超过 2 次，不要直接调用云厂商控制台。
每次模型调用结束后，异步 POST usage event 到 /api/usage/events，并携带 Bearer TOKEN_MONITOR_INGEST_TOKEN。
usage 上报失败不影响业务结果，但需要记录本地日志。
不要上报 prompt、response 原文、用户手机号、身份证、访问密钥等敏感信息。
attributes 只放可用于排查和聚合的业务维度。
```

## 9. 排查

健康检查：

```bash
curl "$TOKEN_MONITOR_BASE_URL/api/health"
```

测试余额接口：

```bash
curl "$TOKEN_MONITOR_BASE_URL/api/mobile/summary" \
  -H "Authorization: Bearer $TOKEN_MONITOR_MOBILE_TOKEN"
```

测试上报接口：

```bash
curl -X POST "$TOKEN_MONITOR_BASE_URL/api/usage/events" \
  -H "Authorization: Bearer $TOKEN_MONITOR_INGEST_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "aliyun",
    "model": "qwen-plus",
    "projectId": "agent-test",
    "environment": "localtest",
    "feature": "integration_test",
    "operationName": "接入测试",
    "accountId": "test",
    "requestId": "manual-test-001",
    "status": "success",
    "promptTokens": 1,
    "completionTokens": 1,
    "totalTokens": 2
  }'
```

常见问题：

| 现象 | 可能原因 |
| --- | --- |
| `401 Missing or invalid mobile token` | `TOKEN_MONITOR_MOBILE_TOKEN` 和服务端 `.env` 的 `MOBILE_API_TOKEN` 不一致 |
| `401 Missing or invalid usage ingest token` | `TOKEN_MONITOR_INGEST_TOKEN` 和服务端 `.env` 的 `USAGE_INGEST_TOKEN` 不一致 |
| 看板里触发人是 `--` | 没有上报 `actorId` / `actorName` |
| 看板里资源是 `--` | 没有上报 `resourceType` / `resourceId` / `resourceName` |
| 余额正常但请求级 token 没变化 | 业务项目只查了余额，没有调用 `/api/usage/events` |
| 近 24h 金额消耗为空 | 余额历史采样不足，或期间余额没有下降 |
