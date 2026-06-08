# Provider Matrix

本项目优先适配“官方提供可编程余额/额度接口”的平台。不同厂商的账务模型差异很大：有的是预付余额，有的是账单后付，有的是组织级用量报表。开源适配时请不要把“用量成本”包装成“余额”。

## 已支持

| Provider | 环境变量 | 接口形态 | 汇总 |
| --- | --- | --- | --- |
| 阿里云百炼 / 费用中心 | `ALIYUN_ACCESS_KEY_ID`, `ALIYUN_ACCESS_KEY_SECRET` | `QueryAccountBalance` | CNY 总额 |
| DeepSeek | `DEEPSEEK_API_KEY` | `/user/balance` | CNY/USD，按返回币种显示 |
| 火山引擎 / 豆包 | `VOLCENGINE_ACCESS_KEY_ID`, `VOLCENGINE_SECRET_ACCESS_KEY`, `VOLCENGINE_REGION` | `QueryBalanceAcct` | CNY 总额 |
| Kimi / Moonshot | `MOONSHOT_API_KEY` | `/v1/users/me/balance` | CNY 总额 |
| SiliconFlow / 硅基流动 | `SILICONFLOW_API_KEY`, `SILICONFLOW_BASE_URL` | `/v1/user/info` | CNY 总额 |
| OpenRouter | `OPENROUTER_API_KEY` | `/api/v1/credits` | USD 单独显示 |

## 适配其他平台

新增 provider 的最小步骤：

1. 在 `server/providers/<provider>.mjs` 新增 fetcher，返回统一结构：

   ```js
   return {
     status: "ok",
     amount: 12.34,
     currency: "CNY",
     message: "余额已同步",
     metrics: [{ label: "现金余额", value: 12.34, currency: "CNY" }]
   };
   ```

2. 在 `server/providers/index.mjs` 注册 `id`、`name`、`shortName`、`accent`、`docsUrl`、`consoleUrl`、`fetcher`。

3. 在 `.env.example` 写清楚需要的 key，不要把真实 `.env` 提交。

4. 如果这个平台不是 CNY，保持 `currency` 原样。只有 CNY 或显式 `amountCny` 会进入 `totalCny`。

5. 如果希望 iOS 小组件可选它，在 `ios/TokenBalanceMonitor/TokenBalanceWidget/BalanceWidgetConfigurationIntent.swift` 加一个枚举值。

## 常见但暂未作为余额接入

| Provider | 现状 | 建议 |
| --- | --- | --- |
| OpenAI API | 官方有 Usage/Costs API，适合查组织成本，不是简单余额接口；这不等同于 ChatGPT 订阅。 | 后续做“本月花费 / 日成本”卡片。 |
| Anthropic / Claude API | 官方 Admin API 可查 messages usage report，面向组织管理员；这不等同于 Claude App 订阅。 | 后续做“用量报表”provider，需要 Admin key。 |
| Gemini | 官方说明通过 Google Cloud Billing/AI Studio 监控账单。 | 后续接 Cloud Billing Export 或预算告警。 |
| 智谱 AI、MiniMax、百度千帆、腾讯混元、讯飞星火 | 需要逐一确认是否有公开、稳定、服务端可调用的余额接口。 | 不建议用网页抓取作为默认开源实现。 |
