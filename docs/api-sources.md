# API Sources

- DeepSeek 查询余额：`GET https://api.deepseek.com/user/balance`，返回 `balance_infos.total_balance`。
  官方文档：https://api-docs.deepseek.com/zh-cn/api/get-user-balance

- Kimi / Moonshot 查询余额：`GET https://api.moonshot.cn/v1/users/me/balance`，返回 `available_balance`、`voucher_balance`、`cash_balance`。
  官方文档：https://platform.kimi.com/docs/api/balance

- SiliconFlow / 硅基流动账户信息：`GET https://api.siliconflow.com/v1/user/info`，返回 `balance`、`chargeBalance`、`totalBalance`。
  官方文档：https://docs.siliconflow.com/cn/api-reference/userinfo/get-user-info

- OpenRouter Credits：`GET https://openrouter.ai/api/v1/credits`，返回 `total_credits` 与 `total_usage`。该接口需要 OpenRouter Management key。
  官方文档：https://openrouter.ai/docs/api/api-reference/credits/get-credits

- 阿里云费用中心：`QueryAccountBalance`，返回 `AvailableAmount`、`AvailableCashAmount`、`Currency`。
  官方文档：https://help.aliyun.com/zh/user-center/developer-reference/api-bssopenapi-2017-12-14-queryaccountbalance/

- 火山引擎费用中心：`QueryBalanceAcct`，返回 `AvailableBalance`、`CashBalance`、`CreditLimit`。
  官方文档：https://www.volcengine.com/docs/6269/1223898

## Notes

- `totalCny` 只汇总 CNY 余额或 provider 显式返回的 `amountCny`。例如 OpenRouter 的 USD credits 会单独显示，不会混入人民币总额。
- OpenAI、Anthropic、Gemini 这类平台更适合接入“用量/成本”视图，不应伪装成简单余额。可参考：
  - OpenAI Costs API：https://platform.openai.com/docs/api-reference/usage/costs
  - Anthropic Usage and Cost Admin API：https://docs.anthropic.com/zh-CN/api/admin-api/usage-cost/get-messages-usage-report
  - Gemini Billing：https://ai.google.dev/gemini-api/docs/billing
