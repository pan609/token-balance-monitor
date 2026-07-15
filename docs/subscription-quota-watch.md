# AI Quota for Apple Watch

这条线独立于 AI Balance。AI Balance 回答“账户里还剩多少钱”，AI Quota 回答“Codex / Claude 这类订阅制工具的 5 小时、每周额度还剩多少”。

## 结论

- 可以做 Apple Watch App，而且要做成前台 App，而不是表盘复杂功能或 Widget。
- 每次打开 Watch App 或从表盘回到前台时，都优先向自己的服务端 `POST /api/quota/refresh` 请求实时刷新；如果服务端不能实时读取，就回退到 `GET /api/quota/summary` 的最近快照。
- Watch App 保持前台时默认每 15 秒刷新一次，用于短时间盯额度变化。服务端默认用 `CODEX_QUOTA_REFRESH_MIN_INTERVAL_MS` 做最小间隔保护。
- Watch 端不保存 OpenAI / Anthropic 登录态，也不读取本机文件。
- iPhone App 是 AI Quota 的 companion：配置服务端、选择 Watch 默认服务、查看最近快照和数据新鲜度，不作为高频主入口。
- macOS 上的高频入口是独立 `./quota.command`，它和 AI Balance 的 `./pet.command` 可以同时运行。
- 本机 Mac 通过 bridge 脚本把 Codex / Claude 的最新额度窗口上报到 `POST /api/quota/snapshots`。
- 如果上报数据超过 `QUOTA_STALE_SECONDS`，Watch 必须显示“可能过期”，不能伪装实时。

## 为什么不能只做表盘小组件

Apple Watch 的表盘复杂功能和 Widget 适合“快速入口”和“低频提示”，但刷新由系统调度，不能保证你抬腕看到的就是刚刚计算出来的额度。

订阅额度监控对准确性要求高，所以主体验应该是 Watch App：

1. 打开 App。
2. App 直接请求 `/api/quota/refresh`。
3. 如果服务端运行在能访问 Codex 登录态的本机 Mac 上，会立即读取一次 Codex rate limit 并写入快照；否则返回最近一次 bridge 上报的快照。
4. App 根据 `fetchedAt` 判断新鲜度。

复杂功能可以后续补，但只作为快捷入口、最近快照或过期提醒，不作为实时数据承诺。真正需要“看时即最新”的场景，仍然要打开 Watch App，让 App 前台发起请求。

## 数据模型

`POST /api/quota/snapshots`：

```json
{
  "serviceId": "claude",
  "serviceName": "Claude",
  "accountLabel": "Max",
  "planLabel": "Claude Code",
  "quotaType": "rate_window",
  "source": "claude-statusline",
  "fetchedAt": "2026-06-16T08:30:00.000Z",
  "windows": [
    {
      "id": "5h",
      "label": "5 小时",
      "usedPercent": 42,
      "remainingPercent": 58,
      "resetsAt": "2026-06-16T10:00:00.000Z"
    },
    {
      "id": "weekly",
      "label": "每周",
      "usedPercent": 65,
      "remainingPercent": 35,
      "resetsAt": "2026-06-21T16:00:00.000Z"
    }
  ]
}
```

AI Quota 当前支持两类快照：

| `quotaType` | 场景 | 窗口示例 |
| --- | --- | --- |
| `rate_window` | Codex / Claude Code 个人订阅窗口 | `5h`、`weekly` |
| `spend_limit` | Claude Team / claude.ai usage spend | `monthly`，包含 `usedText`、`remainingText`、`limitText` |

`GET /api/quota/summary` 会返回每个服务的最新快照、过期状态和告警等级。`POST /api/quota/refresh` 会先尝试实时刷新，再返回同样结构的 summary。默认规则：

- `remainingPercent <= QUOTA_CRITICAL_REMAINING_PERCENT`：紧张
- `remainingPercent <= QUOTA_WARNING_REMAINING_PERCENT`：偏低
- `Date.now() - fetchedAt > QUOTA_STALE_SECONDS`：可能过期

## Claude Code 接入

Claude Code 官方 status line 支持把 JSON session data 传给本地脚本，其中包含订阅用户的 `rate_limits.five_hour.used_percentage`、`rate_limits.seven_day.used_percentage` 和对应 reset 时间。

把 bridge 配到 `~/.claude/settings.json`：

```json
{
  "statusLine": {
    "type": "command",
    "command": "TOKEN_MONITOR_QUOTA_URL=https://your-domain.example/api/quota/snapshots TOKEN_MONITOR_QUOTA_TOKEN=你的QUOTA_INGEST_TOKEN node /path/to/token-balance-monitor/scripts/quota-statusline-bridge.mjs --service claude",
    "refreshInterval": 30
  }
}
```

说明：

- `refreshInterval` 可以让 Claude Code 空闲时也定期重跑脚本。
- bridge 上报失败不会影响 Claude Code 正常使用。
- 如果当前 session 还没有产生第一条模型响应，`rate_limits` 可能为空，Watch 会显示等待或过期。

## Codex 接入

Codex Desktop / CLI 的本地 app-server 协议可以读取 `account/rateLimits/read`。项目内置了一个只读 bridge：

```bash
QUOTA_INGEST_URL=https://your-domain.example/api/quota/snapshots \
QUOTA_INGEST_TOKEN=你的QUOTA_INGEST_TOKEN \
node scripts/codex-quota-bridge.mjs
```

它会：

- 启动本机 Codex app-server 的 stdio 会话。
- 调用 `account/rateLimits/read`。
- 读取 `codex` 这类 limit bucket 的 5 小时窗口和每周窗口。
- 转换为统一的 `POST /api/quota/snapshots` 格式。
- 上报失败时退出非 0，但不会触碰 OpenAI 登录文件，也不会提交模型请求。

只查看 JSON，不上报：

```bash
node scripts/codex-quota-bridge.mjs --json --no-post
```

如果你的 `codex` 命令不在 PATH，可以显式指定：

```bash
CODEX_CLI_PATH=/Applications/Codex.app/Contents/Resources/codex \
node scripts/codex-quota-bridge.mjs --json --no-post
```

手动测试 Codex 数据仍然可用：

```bash
curl -X POST "$QUOTA_INGEST_URL" \
  -H "Authorization: Bearer $QUOTA_INGEST_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "serviceId": "codex",
    "serviceName": "Codex",
    "source": "manual",
    "windows": [
      { "id": "5h", "label": "5 小时", "usedPercent": 70, "remainingPercent": 30 },
      { "id": "weekly", "label": "每周", "usedPercent": 45, "remainingPercent": 55 }
    ]
  }'
```

如果服务端部署在本机 Mac，Watch 手动刷新和前台 15 秒刷新可以直接触发 Codex 实时读取：

```bash
curl -X POST "$QUOTA_REFRESH_URL" \
  -H "x-quota-token: $QUOTA_READ_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"force":true,"serviceId":"codex"}'
```

注意：云服务器通常没有你的 Codex 登录态，所以云端 refresh 只能返回最近快照。想让真机 Watch 也尽量接近实时，需要让本机 Mac 的 bridge 定时把 Codex 快照上报到你的云服务器，或者把服务端运行在这台 Mac 所在网络中。

## macOS Quota 菜单栏

电脑上建议单独运行 AI Quota，而不是把订阅额度混进 AI Balance 桌宠：

```bash
./quota.command
```

常用配置：

```bash
PRIMARY_QUOTA_SERVICE_ID=claude
QUOTA_MENU_SERVICES=claude,codex
QUOTA_MENU_REFRESH_INTERVAL_MS=60000
```

- `PRIMARY_QUOTA_SERVICE_ID` 控制菜单栏标题默认显示哪个服务。
- `QUOTA_MENU_SERVICES` 控制下拉菜单展示哪些服务，逗号分隔；设为 `all` 时使用所有快照。
- 如果你用企业 Codex 代理余额接口，把菜单改成 `QUOTA_MENU_SERVICES=claude,codex_proxy`，并设置 `PRIMARY_QUOTA_SERVICE_ID=codex_proxy`。
- `./pet.command` 默认只显示 AI Balance。只有显式设置 `PET_QUOTA_REFRESH_SERVICE_ID=claude` 或 `codex` 时，才会把 Quota 作为高级信息混入桌宠。

## Watch UI

Watch App 只做高密度但舒服的小屏信息，主屏尽量一屏展示，不要求滚动：

- 顶部：同步状态、时间戳。
- 服务条：当前关注服务，比如 Codex 或 Claude。
- 两个窗口卡片：5 小时、每周，各自显示剩余百分比、进度条和重置时间。
- 设置按钮：切换当前关注服务。
- 手动刷新按钮：用户想确认时可以立即拉取服务端。

不在 Watch 上做复杂筛选、历史图表和登录配置，这些仍放在 Web / macOS 端。

## Simulator 调试

先在 Xcode > Settings > Platforms 下载 watchOS Simulator runtime。下载完成后运行：

```bash
./scripts/run-watch-simulator.sh
```

如果只是本机调试，不想改 `.env` 里的公网地址，可以临时覆盖：

```bash
QUOTA_API_URL=http://127.0.0.1:5199/api/quota/summary \
QUOTA_REFRESH_URL=http://127.0.0.1:5199/api/quota/refresh \
QUOTA_READ_TOKEN=read-test \
./scripts/run-watch-simulator.sh
```

脚本会：

1. 生成本地 `TokenMonitorConfig.swift`。
2. 重新生成 Xcode 工程。
3. 构建 `TokenBalanceWatch`。
4. 优先复用已启动的 Apple Watch Simulator；没有才启动一个可用 Watch。
5. 安装并启动 Watch App。

如果要指定设备：

```bash
WATCH_SIM_UDID=你的Watch模拟器UDID ./scripts/run-watch-simulator.sh
```

## 环境变量

```bash
QUOTA_READ_TOKEN=给Watch读取的token
QUOTA_INGEST_TOKEN=给本机bridge上报的token
QUOTA_API_URL=https://your-domain.example/api/quota/summary
QUOTA_REFRESH_URL=https://your-domain.example/api/quota/refresh
QUOTA_INGEST_URL=https://your-domain.example/api/quota/snapshots
PRIMARY_QUOTA_SERVICE_ID=codex
QUOTA_STALE_SECONDS=120
QUOTA_WARNING_REMAINING_PERCENT=20
QUOTA_CRITICAL_REMAINING_PERCENT=8
CODEX_QUOTA_REFRESH_MIN_INTERVAL_MS=10000
```

## 官方依据

- Claude Code status line：`rate_limits.five_hour` / `rate_limits.seven_day` 会进入本地脚本 stdin。
  https://code.claude.com/docs/en/statusline
- Codex CLI slash commands：`/statusline` 可显示 rate limits。
  https://developers.openai.com/codex/cli/slash-commands
- Codex 配置参考：`tui.status_line` 只是状态栏 item 配置。
  https://developers.openai.com/codex/config-reference
