# Contributing

欢迎提交新的 provider、UI 优化和部署文档。为了让项目对其他人安全可用，请遵守下面几条：

- 不要提交 `.env`、真实 AccessKey、API Key、移动端 token、服务器密码或 Xcode 生成的本地配置。
- 新 provider 必须基于官方文档或稳定 API，并在 `docs/api-sources.md` 里补链接。
- 不同币种不要直接相加；非 CNY 余额应单独显示，除非 provider 明确返回 `amountCny`。
- 前端展示应使用 `/api/balances` 返回的数据，不要把密钥暴露到浏览器或 iOS 客户端。
- 改 iOS 后请至少运行一次 `./scripts/run-ios-simulator.sh` 或 Xcode build。
- 改 Web/Electron 后请至少运行一次 `./scripts/build.sh`。

## Provider 返回约定

`fetcher()` 推荐返回：

```js
{
  status: "ok",
  amount: 12.34,
  currency: "CNY",
  message: "余额已同步",
  metrics: [
    { label: "现金余额", value: 12.34, currency: "CNY" }
  ],
  raw: {}
}
```

配置缺失时使用 `missingConfig(providerName, envNames)`；接口错误时抛出 `Error`，并尽量附上 `error.raw`，便于本地排查。
