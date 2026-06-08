# Security

## Secrets

- `.env`、`.pet-settings.json`、`ios/TokenBalanceMonitor/Shared/TokenMonitorConfig.swift` 都是本地私有文件，已在 `.gitignore` 中排除。
- Web 前端、iOS App 和 Widget 都不应直接持有云厂商 AccessKey。它们只访问本地或自托管的摘要接口。
- `MOBILE_API_TOKEN` 应使用长随机字符串。公网部署时建议只走 HTTPS，并限制访问路径。

## Key 权限

尽量给云厂商 key 最小权限：

- 阿里云：只给费用中心余额查询所需权限。
- 火山引擎：只给费用中心余额查询所需权限。
- OpenRouter：`/credits` 需要 Management key，请单独保存并定期轮换。

## Disclosure

如果你发现安全问题，请先私下联系维护者，不要在公开 issue 中贴真实密钥、服务器地址、请求响应或账单截图。
