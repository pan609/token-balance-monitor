# Claude Code 订阅额度接入

这份文档只讲 Claude Code 的 5 小时 / 7 天订阅额度窗口。它和阿里云、DeepSeek、豆包这些 API Key 余额不是同一类数据。

## 原理

Claude Code 的 status line 会在本机执行一个你配置的命令，并把当前 session 的 JSON 数据通过 stdin 传给这个命令。Claude 官方字段里包含：

- `rate_limits.five_hour.used_percentage`
- `rate_limits.five_hour.resets_at`
- `rate_limits.seven_day.used_percentage`
- `rate_limits.seven_day.resets_at`

`used_percentage` 是已用百分比，token-monitor 会换算成剩余百分比。`resets_at` 是 Unix epoch 秒，表示窗口重置时间。

token-monitor 不需要 Claude 账号密码，也不读取 Claude 的本地登录文件。它只接收 Claude Code status line 主动传出来的额度窗口，然后写入你的 token-monitor 服务端。

官方字段说明见 Claude Code status line 文档：https://code.claude.com/docs/en/statusline

## 前置条件

你需要在将要接入的电脑上具备：

- 已登录的 Claude Code。
- Claude.ai Pro / Max 个人订阅。
- 至少发起过一次 Claude Code 对话，因为 `rate_limits` 通常在当前 session 第一次 API 响应后才出现。
- 能访问你的 token-monitor 服务端。
- 服务端配置了 `QUOTA_INGEST_TOKEN`。

如果你使用的是 API billing、Bedrock、Vertex 或其他非 Claude.ai 订阅模式，status line 里可能没有 `rate_limits`。这时可以做成本统计，但不能显示 Pro / Max 的 5 小时和每周订阅额度。

## 服务端配置

在 token-monitor 的 `.env` 中至少设置：

```bash
QUOTA_READ_TOKEN=replace-with-read-token
QUOTA_INGEST_TOKEN=replace-with-ingest-token
QUOTA_API_URL=https://your-domain.example/api/quota/summary
QUOTA_REFRESH_URL=https://your-domain.example/api/quota/refresh
QUOTA_INGEST_URL=https://your-domain.example/api/quota/snapshots
PRIMARY_QUOTA_SERVICE_ID=claude
QUOTA_STALE_SECONDS=120
```

`QUOTA_READ_TOKEN` 给 Watch / iPhone / Web 读取 summary 用。`QUOTA_INGEST_TOKEN` 给 Claude Code 所在电脑上报快照用。

## Claude Code 电脑配置

在另一台电脑 clone 项目：

```bash
git clone https://github.com/pan609/token-balance-monitor.git
cd token-balance-monitor
npm ci
```

确认 bridge 能解析 Claude status line JSON：

```bash
echo '{
  "model": { "display_name": "Sonnet" },
  "rate_limits": {
    "five_hour": { "used_percentage": 37, "resets_at": 1790000000 },
    "seven_day": { "used_percentage": 52, "resets_at": 1790500000 }
  }
}' | node scripts/quota-statusline-bridge.mjs --service claude --json
```

期望输出里能看到：

```json
{
  "serviceId": "claude",
  "quotaType": "rate_window",
  "windows": [
    { "id": "5h", "remainingPercent": 63 },
    { "id": "weekly", "remainingPercent": 48 }
  ]
}
```

然后把 status line 写入 `~/.claude/settings.json`：

```json
{
  "statusLine": {
    "type": "command",
    "command": "TOKEN_MONITOR_QUOTA_URL=https://your-domain.example/api/quota/snapshots TOKEN_MONITOR_QUOTA_TOKEN=replace-with-ingest-token node /absolute/path/to/token-balance-monitor/scripts/quota-statusline-bridge.mjs --service claude",
    "refreshInterval": 15
  }
}
```

把 `/absolute/path/to/token-balance-monitor` 换成项目在那台电脑上的真实路径。

如果你已经有自己的 Claude Code status line，不建议直接覆盖。可以先把原配置备份下来，再决定是：

- 只用 token-monitor 的简短显示。
- 写一个 wrapper，先调用原 status line，再调用 `quota-statusline-bridge.mjs` 上报。
- 让原 status line 继续显示，token-monitor bridge 只输出很短的一行，避免终端底部太挤。

## 工作方式和刷新频率

Claude Code 会在这些时机运行 status line 命令：

- 新 assistant 消息后。
- `/compact` 完成后。
- 权限模式、vim mode 等状态变化后。
- 配置了 `refreshInterval` 时，按固定间隔重跑。

因此 Claude Code 电脑在线且 Claude Code 进程存在时，token-monitor 可以持续收到最新快照。电脑关机、Claude Code 未运行、session 里还没有首次 API 响应时，服务端只能显示最后一次快照，并在超过 `QUOTA_STALE_SECONDS` 后标记“可能过期”。

## 和 Codex 的区别

Codex 目前通过本机 Codex app-server 主动读取 rate limits，可以由 token-monitor 服务端触发实时刷新。

Claude Code 当前推荐走 status line：Claude Code 把额度字段传给脚本，脚本再上报给 token-monitor。这样不需要保存 Claude 登录态，也不需要把 Claude 账号搬到云服务器。

## 故障排查

如果看不到 Claude 额度：

1. 确认 Claude Code 已经发起过至少一次真实响应。
2. 确认你是 Claude.ai Pro / Max 订阅。
3. 运行 `claude --debug`，看 status line 命令是否报错。
4. 手动用 mock JSON 测试 `scripts/quota-statusline-bridge.mjs`。
5. 确认 `TOKEN_MONITOR_QUOTA_URL` 能从这台电脑访问。
6. 确认 `TOKEN_MONITOR_QUOTA_TOKEN` 和服务端 `QUOTA_INGEST_TOKEN` 一致。

## 安全边界

- 不提交 `.env`。
- 不把 Claude 账号密码、session、cookie 写进 token-monitor。
- 只上报额度窗口百分比和重置时间。
- 如果公网部署，`QUOTA_INGEST_TOKEN` 必须是长随机字符串。
