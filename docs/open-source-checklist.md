# Open Source Checklist

发布前建议逐项确认：

- `.env`、真实 AccessKey、API Key、移动端 token、服务器密码、个人服务器 IP 不进入仓库。
- 示例 URL 使用 `example.com`、`127.0.0.1` 或明确的占位符，不要写个人服务器地址。
- iOS 真机签名 Team ID、设备 UDID、个人 Apple ID 不进入仓库；需要时用环境变量传入。
- `ios/TokenBalanceMonitor/Shared/TokenMonitorConfig.swift` 不进入仓库；它由脚本从本地 `.env` 生成。
- `node_modules/`、`dist/`、`.tools/`、`DerivedData*/`、`.xcuserdata/` 等生成产物不进入仓库。
- README 能让新用户从零跑起来：复制 `.env.example`、安装依赖、启动 Web、启动桌宠、运行 iOS。
- 新 provider 只使用官方 API 或稳定接口，并在 `docs/api-sources.md` 与 `docs/provider-matrix.md` 里补充来源。
- 不同币种不要直接汇总；只有 CNY 或显式返回 `amountCny` 的 provider 进入 `totalCny`。
- 安全相关变更先看 `SECURITY.md`，避免把云厂商密钥下发到浏览器、iOS App 或 Widget。

本地发布前检查：

```bash
./scripts/build.sh
PATH="/opt/homebrew/bin:$PATH" npm run check
xcodebuild -project ios/TokenBalanceMonitor/TokenBalanceMonitor.xcodeproj -scheme TokenBalanceMonitor -destination 'generic/platform=iOS Simulator' -derivedDataPath ios/TokenBalanceMonitor/DerivedDataCheck CODE_SIGNING_ALLOWED=NO build
git ls-files --others --exclude-standard
```

如果 `git ls-files --others --exclude-standard` 里出现 `.env`、`TokenMonitorConfig.swift`、`DerivedData`、`node_modules` 或 `dist`，先更新 `.gitignore`，不要提交。
