<p align="center">
  <img src="design/ai-meter-icon.svg" alt="AI Meter" width="144">
</p>

<h1 align="center">AI Meter</h1>

<p align="center">
  一个自托管的 AI 用量仪表盘。把模型平台余额、请求级 token 明细、Codex / Claude 订阅额度窗口分开看清楚。
</p>

<p align="center">
  <strong>AI Balance</strong> tracks provider credits and token usage.
  <strong>AI Quota</strong> tracks subscription quota windows for Codex / Claude.
</p>

<p align="center">
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/github/license/pan609/token-balance-monitor"></a>
  <img alt="Node" src="https://img.shields.io/badge/node-%3E%3D20-339933?logo=node.js&logoColor=white">
  <img alt="Platforms" src="https://img.shields.io/badge/Web%20%7C%20Skill%20%7C%20macOS%20%7C%20iOS%20%7C%20Watch-111827">
  <img alt="Privacy" src="https://img.shields.io/badge/keys-server%20side-0f766e">
</p>

<p align="center">
  <a href="https://ai.meter.panyue.xyz/projects/token-balance-monitor/">Website</a> ·
  <a href="#5-分钟跑起来">Quick Start</a> ·
  <a href="#agent-skill">Agent Skill</a> ·
  <a href="docs/api-reference.md">API Reference</a> ·
  <a href="#支持平台">Providers</a> ·
  <a href="#安全模型">Privacy & Security</a>
</p>

## Product Lines

AI Meter 由两条产品线组成。它们在同一个仓库里开发，也共用同一个自托管服务，但后续按两个项目来做页面、文档、截图和 SEO：

| 产品线 | 看什么 | 典型入口 |
| --- | --- | --- |
| **AI Balance** | 阿里云百炼、DeepSeek、豆包、Kimi、硅基流动、OpenRouter 的账户余额，以及请求级 token 明细 | Web 看板、Agent Skill、macOS 状态栏/桌宠、iPhone App、iOS Widget |
| **AI Quota** | Codex / Claude Code 的 5 小时 / 每周窗口，Claude Team / 企业 Codex 代理这类月度 spend limit | macOS `quota.command`、Apple Watch App、Watch complication、iPhone companion、本机 bridge |

AI Balance 回答“账户里还剩多少钱、哪次请求用了多少 token”。AI Quota 回答“这一轮订阅额度还剩多少、多久重置”。这两个概念不会混算。

官网入口：

- [AI Balance](https://ai.meter.panyue.xyz/projects/ai-balance/)：模型平台余额、credits 和请求级 token usage。
- [AI Quota](https://ai.meter.panyue.xyz/projects/ai-quota/)：Codex / Claude Code 的订阅额度窗口。

云厂商 AccessKey 只保存在你自己的服务端 `.env`，不会打包进浏览器、macOS 客户端或 iPhone App。

## 适合谁 / Who it is for

- **多平台 AI 开发者**：同时使用阿里云百炼、DeepSeek、豆包、Kimi、硅基流动、OpenRouter，希望不用每天打开多个控制台查余额。
- **Agent / 后端项目维护者**：想知道每次模型调用来自哪个项目、功能、账号或业务对象，而不把 prompt 和 response 存进看板。
- **Codex / Claude Code 重度用户**：希望在写代码时确认 5 小时或每周订阅额度窗口，而不是等到请求被限速才发现。
- **自托管优先的团队**：希望云厂商密钥留在自己的服务端，只把只读 token 或上报 token 发给客户端、Widget 或业务系统。

For English readers: this project is a local-first, self-hosted balance and token-usage monitor for teams that call multiple LLM providers and want operational visibility without sending provider keys or prompt content to a third-party dashboard.

## 选你需要的形态

每个入口都是独立的，按需要选一个用就行。

| 形态 | 用途 | 入口 |
| --- | --- | --- |
| **Web 看板** | 查看余额、近 24h 消耗、请求级 token 明细 | `./start.command` |
| **Agent Skill** | 让 Codex/Agent 查询余额、上报 usage | [skills/token-balance-monitor](skills/token-balance-monitor) |
| **macOS Balance 桌宠** | 在电脑右上角看预付费余额、重点平台、近 24h 消耗 | `./pet.command` |
| **macOS Quota 菜单栏** | 写代码时看 Codex / Claude 订阅额度 | `./quota.command` |
| **iPhone App / Widget** | `AI Balance` 余额查看、重点平台切换、低余额提醒；`AI Quota` 只做配置和最近快照 | [ios/TokenBalanceMonitor](ios/TokenBalanceMonitor) |
| **Apple Watch App / Complication** | `AI Quota` 查看 Codex / Claude 的 5 小时、每周剩余额度窗口 | [docs/subscription-quota-watch.md](docs/subscription-quota-watch.md) |
| **Claude Code 额度桥接** | 用 Claude Code status line 上报 Pro / Max 订阅额度 | [docs/claude-code-quota.md](docs/claude-code-quota.md) |
| **本机私有 Quota Adapter** | 把公司内部代理、SSO 后台或私有账单接口转换成标准 spend limit JSON | [docs/local-private-quota-adapter.md](docs/local-private-quota-adapter.md) |
| **Scriptable 小组件** | 不装原生 App，只要一个轻量 iPhone 小组件 | [docs/ios-scriptable-widget.js](docs/ios-scriptable-widget.js) |

## 预览

<p align="center">
  <img src="docs/assets/readme/web-overview.jpg" alt="Web 余额总览" width="860">
</p>

| 请求级 Token 看板 | 请求详情 |
| --- | --- |
| <img src="docs/assets/readme/web-usage-dashboard.jpg" alt="请求级 Token 看板" width="420"> | <img src="docs/assets/readme/web-request-detail.jpg" alt="请求详情" width="420"> |

| macOS 桌宠 | iPhone App / Widget |
| --- | --- |
| <img src="docs/assets/pet-widget-desktop-providers.png" alt="macOS 桌宠" width="300"> | <img src="docs/assets/ios-token-monitor-updated.png" alt="iPhone App" width="240"> |

## 5 分钟跑起来

### 1. 安装

```bash
git clone https://github.com/pan609/token-balance-monitor.git
cd token-balance-monitor

cp .env.example .env
./scripts/install-deps.sh
```

没有全局 `npm` 也没关系，项目脚本会优先使用本地和 Codex bundled Node runtime。

### 2. 填 key

打开 `.env`，按需填写你使用的平台。只想先看界面也可以留空，页面会显示“待配置”。

```bash
PRIMARY_PROVIDER_ID=aliyun
LOW_BALANCE_THRESHOLD_CNY=20

ALIYUN_ACCESS_KEY_ID=
ALIYUN_ACCESS_KEY_SECRET=

DEEPSEEK_API_KEY=
VOLCENGINE_ACCESS_KEY_ID=
VOLCENGINE_SECRET_ACCESS_KEY=
MOONSHOT_API_KEY=
SILICONFLOW_API_KEY=
OPENROUTER_API_KEY=
```

完整配置见 [.env.example](.env.example)。

### 3. 打开你要的入口

```bash
# Web 看板
./start.command

# macOS Balance 桌宠 / 状态栏
./pet.command

# macOS 订阅额度菜单栏
./quota.command
```

iOS:

```bash
# 模拟器
./scripts/run-ios-simulator.sh

# 真机
./scripts/run-ios-device.sh
```

## Agent Skill

Agent 场景只依赖自托管服务，不需要安装 macOS 或 iOS 客户端。

安装 Skill：

```bash
mkdir -p ~/.codex/skills
cp -R skills/token-balance-monitor ~/.codex/skills/
```

给 Agent 配置：

```bash
TOKEN_MONITOR_BASE_URL=https://balance.example.com/token-monitor
TOKEN_MONITOR_MOBILE_TOKEN=只读查询token
TOKEN_MONITOR_INGEST_TOKEN=usage上报token
```

可用能力：

```bash
# 查询余额
node ~/.codex/skills/token-balance-monitor/scripts/token-monitor.mjs balance

# 输出请求明细看板地址
node ~/.codex/skills/token-balance-monitor/scripts/token-monitor.mjs dashboard

# 上报请求级 token
node ~/.codex/skills/token-balance-monitor/scripts/token-monitor.mjs report ./usage-event.json
```

详细字段和行为建议见 [Agent 接入文档](docs/agent-integration.md)；稳定接口契约见 [API Reference](docs/api-reference.md)。

## 请求级 Token 看板

余额只能回答“还剩多少钱”。如果你想知道“哪次请求花了多少 token、来自哪个项目、哪个用户、哪个业务对象”，在业务项目里接入 usage 上报。

推荐模式是 `report-only`：

```text
业务项目 -> 模型平台
业务项目 -> Token Monitor /api/usage/events
```

最小事件示例：

```json
{
  "projectId": "my-product",
  "environment": "production",
  "provider": "aliyun",
  "model": "qwen-plus",
  "feature": "chat_completion",
  "operationName": "智能问答",
  "accountId": "workspace:1",
  "actorId": "user:123",
  "requestId": "req_abc",
  "status": "success",
  "promptTokens": 1200,
  "completionTokens": 340,
  "totalTokens": 1540
}
```

内置 JS SDK 在 [sdk/javascript](sdk/javascript)。完整事件模型、旧字段兼容和接入示例见 [Agent 接入文档](docs/agent-integration.md)，接口鉴权、请求体和响应格式见 [API Reference](docs/api-reference.md)。

## Codex / Claude 订阅额度窗口

Codex / Claude Code 的订阅额度不是模型平台账户余额。这里的“额度窗口”指 5 小时、每周这类订阅周期里还剩多少可用空间。

AI Meter 用独立的 quota 通道处理这类数据，不会把订阅额度混进余额汇总：

- Codex 可以通过本机 `scripts/codex-quota-bridge.mjs` 读取 rate limit 后上报，`quotaType=rate_window`。
- Claude Code 推荐用 status line 把 `rate_limits` 字段上报到服务端，`quotaType=rate_window`。
- Claude Team / claude.ai usage spend 可以通过 `scripts/claude-quota-bridge.mjs` 读取月度 spend limit，`quotaType=spend_limit`。
- 企业 Codex / OpenAI-compatible 代理如果提供 API Key 余额接口，可以通过 `scripts/codex-proxy-quota-bridge.mjs` 接入，`quotaType=spend_limit`。
- 如果企业代理只能通过内部后台、SSO 登录态或私有接口查询 spend，请在 `.local/` 或仓库外写本机私有 adapter，再把 `CODEX_PROXY_BALANCE_URL` 指向 `http://127.0.0.1:17891/balance`。详见 [Local private quota adapter](docs/local-private-quota-adapter.md)。
- Apple Watch 前台 App 读取 `/api/quota/summary` 或触发 `/api/quota/refresh`，并在数据过期时显示“可能过期”。
- macOS 上用 `./quota.command` 单独显示订阅额度；`./pet.command` 默认只显示 AI Balance。

```bash
# Codex: 只查看本机读取结果
node scripts/codex-quota-bridge.mjs --json --no-post

# Claude Code: 用 mock status line JSON 测试桥接脚本
echo '{"rate_limits":{"five_hour":{"used_percentage":37},"seven_day":{"used_percentage":52}}}' \
  | node scripts/quota-statusline-bridge.mjs --service claude --json
```

详细说明见 [Apple Watch 订阅额度监控](docs/subscription-quota-watch.md)、[Claude Code 订阅额度接入](docs/claude-code-quota.md)、[Claude spend bridge](docs/claude-spend-bridge.md)、[Codex enterprise proxy spend](docs/codex-proxy-quota.md) 和 [Local private quota adapter](docs/local-private-quota-adapter.md)。稳定 API 见 [API Reference](docs/api-reference.md#subscription-quota-api)。

## 支持平台

| 平台 | 接入方式 | 余额汇总 |
| --- | --- | --- |
| 阿里云百炼 / 费用中心 | RAM AccessKey + 费用中心 API | CNY |
| DeepSeek | API Key + `/user/balance` | 按返回币种显示 |
| 火山引擎 / 豆包 | AccessKey + 费用中心 API | CNY |
| Kimi / Moonshot | API Key + 余额 API | CNY |
| SiliconFlow / 硅基流动 | API Key + 用户信息 API | CNY |
| OpenRouter | Management key + credits API | USD 单独显示 |

`totalCny` 只汇总人民币余额。OpenRouter 这类 USD credits 会单独显示，不混入人民币总额。

OpenAI / Anthropic / Gemini 更适合做“本月成本 / 用量报表”，不是简单余额接口。当前适配状态见 [provider matrix](docs/provider-matrix.md)。

## 刷新和提醒

- 服务端默认每 1 分钟刷新余额并记录历史快照。
- Web 看板根据余额快照估算近 24h 消耗。
- macOS Balance 桌宠默认每 1 分钟刷新。
- macOS Quota 菜单栏默认每 1 分钟刷新，可用 `QUOTA_MENU_REFRESH_INTERVAL_MS` 调整。
- iPhone App 前台打开时每 1 分钟刷新。
- WidgetKit 小组件通常不会严格每分钟刷新，最终频率由 iOS 调度。
- iPhone 低余额提醒阈值由 `MOBILE_ALERT_THRESHOLD_CNY` 控制，默认 2 元。
- Codex / Claude 这类订阅额度窗口走独立 quota 通道。Codex 可由本机服务实时读取；Claude Code 推荐通过 status line 上报；Claude Team spend 通过 claude.ai usage bridge 读取。详见 [Claude Code 额度接入](docs/claude-code-quota.md) 和 [Claude spend bridge](docs/claude-spend-bridge.md)。

## 服务器部署

有服务器时，推荐把 Node 服务部署在服务器内网端口，再用 Nginx/Caddy 提供 HTTPS。iPhone App、Widget、Agent Skill 都访问你的自托管服务。

最小启动：

```bash
git clone https://github.com/pan609/token-balance-monitor.git /opt/token-balance-monitor
cd /opt/token-balance-monitor
cp .env.example .env
npm ci
npm run build
NODE_ENV=production node server/index.mjs
```

生产环境至少设置：

```bash
NODE_ENV=production
HOST=127.0.0.1
PORT=5173
MOBILE_API_TOKEN=replace-with-long-random-token
USAGE_INGEST_TOKEN=replace-with-another-long-random-token
PRIMARY_PROVIDER_ID=aliyun
```

完整 systemd、Nginx、HTTPS、iPhone 连接示例见 [部署文档](docs/deployment.md)。

## 重点关注平台

`PRIMARY_PROVIDER_ID` 控制 Web、macOS、iOS、小组件默认显示的重点平台。

可选值：

```text
aliyun
moonshot
deepseek
siliconflow
volcengine
openrouter
```

命令行切换：

```bash
./scripts/set-primary-provider.sh deepseek
./scripts/set-primary-provider.sh 豆包
```

如果是自托管服务器，可以用脚本同步更新远端配置：

```bash
TOKEN_MONITOR_REMOTE_HOST=user@example.com \
TOKEN_MONITOR_REMOTE_DIR=/home/user/token-monitor \
./scripts/set-primary-provider.sh deepseek --both
```

## 安全模型

- `.env` 已加入 `.gitignore`，不要提交真实 key。
- AccessKey 和 API Key 只在 Express 服务端读取。
- Web 前端、macOS 桌宠、iOS App、小组件都不持有云厂商密钥。
- 公网部署必须设置强随机 `MOBILE_API_TOKEN` 和 `USAGE_INGEST_TOKEN`。
- 如果曾经把服务器密码或真实 key 贴到聊天、issue、日志里，建议立即轮换。

更多安全建议见 [SECURITY.md](SECURITY.md)。

## 项目结构

```text
server/                  余额 provider、历史快照、usage events API、quota API
src/                     Web 看板
pet/                     macOS 桌宠 UI
electron/                macOS Balance 桌宠和 AI Quota 菜单栏外壳
ios/TokenBalanceMonitor  iPhone App、WidgetKit 和 Apple Watch App
skills/token-balance-monitor
                         给 Agent / Codex 使用的 Skill
sdk/javascript           请求级 token 上报 SDK
docs/                    部署、接入、平台说明
```

接口文档见 [API Reference](docs/api-reference.md)。它只把 `GET /api/mobile/summary`、`POST /api/usage/events` 等稳定集成面作为主要入口；Web Dashboard 内部读取接口单独标注。

## 新增平台

如果平台有官方余额 API，新增成本很低：

1. 新增 `server/providers/<name>.mjs`，读取 `.env` 中的 key，请求官方接口。
2. fetcher 返回统一结构：`status`、`amount`、`currency`、`message`、`metrics`。
3. 在 `server/providers/index.mjs` 注册平台信息和 fetcher。
4. 在 `.env.example` 和 [API sources](docs/api-sources.md) 补配置与官方文档链接。
5. 如果要让 iPhone 小组件可选它，在 `BalanceWidgetConfigurationIntent.swift` 增加一个枚举值。

## 开发

```bash
./scripts/build.sh
npm run check
```

改 iOS 后建议至少跑一次：

```bash
xcodebuild \
  -project ios/TokenBalanceMonitor/TokenBalanceMonitor.xcodeproj \
  -scheme TokenBalanceMonitor \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath ios/TokenBalanceMonitor/DerivedDataCheck \
  CODE_SIGNING_ALLOWED=NO \
  build
```

贡献前请看 [CONTRIBUTING.md](CONTRIBUTING.md) 和 [open source checklist](docs/open-source-checklist.md)。

## License

[MIT](LICENSE)
