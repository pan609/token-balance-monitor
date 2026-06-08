# Token 余额监控

一个本地运行的 AI 模型账户余额监控工具，支持 Web 看板、macOS 状态栏桌宠、iPhone App 和 WidgetKit 小组件。

已支持：

- 阿里云百炼 / 费用中心
- DeepSeek
- 火山引擎 / 豆包
- Kimi / Moonshot
- SiliconFlow / 硅基流动
- OpenRouter credits

> `totalCny` 只汇总人民币余额。OpenRouter 这类 USD credits 会单独显示，不会混入人民币总额。

## 启动

### 桌宠模式

双击 `pet.command`。它会打开一个小型置顶桌面挂件，直接读取 `.env` 并刷新余额，不需要先打开网页。

- 默认每 1 分钟自动刷新一次。
- 自动刷新在后台主进程里执行；只要桌宠程序还在运行，窗口隐藏到状态栏后金额也会继续更新。
- macOS 右上角状态栏会显示当前总余额，可打开菜单显示/隐藏桌宠、立即刷新、打开网页看板或退出；如果菜单栏太挤看不到入口，可以按 `⌘⇧B` 显示/隐藏。
- 状态栏金额可以在菜单的“状态栏显示”中切换为总余额、重点关注或任意已返回的平台金额。
- 桌宠窗口和状态栏菜单都可以切换“重点关注平台”；切换后状态栏会自动改为显示“重点关注”。
- 桌宠右上角 `⌃` 是置顶开关，`−` 是收起，`×` 是隐藏到状态栏。
- 重复双击 `pet.command` 不会开多个桌宠，会把已经运行的桌宠叫出来。

桌面版和网页看板使用同一套 provider 适配器，支持阿里云、Kimi、DeepSeek、SiliconFlow / 硅基流动、火山引擎/豆包、OpenRouter。桌面版读取本机 `.env`，因此某个平台如果显示“待配置”，需要先在本机 `.env` 填入对应 key。

### 网页看板

1. 复制配置文件：

   ```bash
   cp .env.example .env
   ```

2. 在 `.env` 中填写各平台密钥。只想先看界面也可以留空，页面会显示“待配置”。

3. 双击 `start.command`，或在终端运行：

   ```bash
   ./start.command
   ```

4. 终端会显示实际地址。如果 `5173` 已被别的项目占用，会自动换到后续空端口，例如：

   ```text
   http://127.0.0.1:5173
   ```

网页看板打开后会每 1 分钟静默刷新一次，刷新按钮仍可随时手动触发。

## 配置项

```bash
LOW_BALANCE_THRESHOLD_CNY=20
PRIMARY_PROVIDER_ID=aliyun
HOST=127.0.0.1
MOBILE_API_TOKEN=
MOBILE_API_URL=http://127.0.0.1:5173/api/mobile/summary
MOBILE_ALERT_THRESHOLD_CNY=2
DEEPSEEK_API_KEY=
MOONSHOT_API_KEY=
SILICONFLOW_API_KEY=
SILICONFLOW_BASE_URL=https://api.siliconflow.com
OPENROUTER_API_KEY=
ALIYUN_ACCESS_KEY_ID=
ALIYUN_ACCESS_KEY_SECRET=
VOLCENGINE_ACCESS_KEY_ID=
VOLCENGINE_SECRET_ACCESS_KEY=
VOLCENGINE_REGION=cn-beijing
```

## 权限

- DeepSeek：开放平台 API Key，需要能调用 `/user/balance`。
- Kimi / Moonshot：开放平台 API Key，需要能调用 `/v1/users/me/balance`。
- SiliconFlow / 硅基流动：API Key，需要能调用 `/v1/user/info`。如你的账号必须走旧中国大陆域名，可设置 `SILICONFLOW_BASE_URL=https://api.siliconflow.cn`。
- OpenRouter：`/api/v1/credits` 需要 Management key，返回 USD credits。
- 阿里云：RAM 用户需要费用中心 `bss:DescribeAcccount` 权限。
- 火山引擎：AccessKey 需要能调用费用中心 `QueryBalanceAcct`。

更多平台状态见 `docs/provider-matrix.md`。

## 重点关注

`PRIMARY_PROVIDER_ID` 控制统一的重点关注平台，默认是 `aliyun`。

在 iPhone App 里，打开右上角齿轮，或使用首页的“重点关注平台”选择卡片即可切换。保存成功后：

- iPhone App 顶部“重点关注”卡片会立即更新。
- 小组件如果选择的是“重点关注”，会跟随更新。
- 服务器 `.env` 会同步写入新的 `PRIMARY_PROVIDER_ID`。

命令行备用切换方式：

```bash
./scripts/set-primary-provider.sh deepseek
```

它默认更新本机 Mac 配置。也可以用中文别名：

```bash
./scripts/set-primary-provider.sh 豆包
```

如果你自托管了给 iPhone App / Widget 使用的服务器，可以显式传入远程地址同时更新服务器配置：

```bash
TOKEN_MONITOR_REMOTE_HOST=user@example.com \
TOKEN_MONITOR_REMOTE_DIR=/home/user/token-monitor \
./scripts/set-primary-provider.sh deepseek --both
```

可选值：

```text
aliyun
moonshot
deepseek
siliconflow
volcengine
openrouter
```

这个值会影响：

- iPhone App 顶部“重点关注”卡片。
- Widget 选择“重点关注”时显示的平台。
- macOS 状态栏菜单里“重点关注”的金额。

Widget 也可以手动固定为某个平台：长按小组件，选择“编辑小组件”，把“显示”从“重点关注”改成阿里云、DeepSeek、Kimi 等固定项。

## 添加其他平台

如果平台有官方余额 API，新增成本很低：

1. 新增 `server/providers/<name>.mjs`，读取 `.env` 中的 key，请求官方接口。
2. fetcher 返回统一结构：`status`、`amount`、`currency`、`message`、`metrics`。
3. 在 `server/providers/index.mjs` 注册平台信息和 fetcher。
4. 在 `.env.example` 和 `docs/api-sources.md` 补配置与官方文档链接。
5. 如果要让 iPhone 小组件可选它，在 `BalanceWidgetConfigurationIntent.swift` 增加一个枚举值。

ChatGPT 订阅不是 OpenAI API 余额，Claude 订阅也不是 Anthropic API 余额。OpenAI、Anthropic、Gemini 更适合做“本月成本/用量报表”，不是简单余额接口；不要用网页抓取作为默认开源方案。

## 安全

- `.env` 已加入 `.gitignore`。
- AccessKey 和 API Key 只在本地 Express 服务端读取，不会打包进浏览器前端。
- 前端只保存刷新历史中的余额数字，用于画本地趋势线。
- iOS App 和 Widget 只读取 `/api/mobile/summary` 摘要接口，不保存云厂商密钥。
- 如果曾经把服务器密码或真实 key 贴到聊天、issue、日志里，建议立即轮换。

## iPhone 小组件

现在有两条路线：

### 原生 iOS App + WidgetKit

已在 `ios/TokenBalanceMonitor` 里加入轻量原生工程。它不会把阿里云、火山或 DeepSeek 的密钥放进手机端，只读取你服务器上的移动端摘要接口。

iPhone App 在前台打开时会每 1 分钟自动刷新一次。主屏幕小组件由 iOS WidgetKit 调度，当前请求每 15 分钟刷新一次，并在 App 内切换重点关注或手动刷新后主动请求刷新小组件；iOS 不保证小组件按分钟级后台刷新。

从项目根目录运行：

```bash
./scripts/run-ios-simulator.sh
```

这个脚本会从 `.env` 生成本地 iOS 配置、生成 Xcode 工程、构建并启动模拟器。更多说明见 `ios/TokenBalanceMonitor/README.md`。

### Scriptable 轻量小组件

如果暂时不想装原生 App，也可以用 Scriptable 小组件。普通网页不能直接变成 iOS 原生桌面小组件，Apple 的系统小组件能力来自 WidgetKit App；Scriptable 可以用少量 JavaScript 在主屏幕显示数据。

1. 云端接口已支持小组件访问，地址形如：

   ```text
   https://example.com/token-monitor/api/mobile/summary?token=你的MOBILE_API_TOKEN
   ```

2. 在 iPhone 安装 Scriptable，把 `docs/ios-scriptable-widget.js` 复制进去，并把 `API_URL` 里的 token 改成 `.env` 中的 `MOBILE_API_TOKEN`。

3. 在 iPhone 主屏幕添加 Scriptable 小组件，选择这个脚本。

小组件适合随手查看；iOS 不保证小组件每分钟后台刷新。低于阈值的持续后台主动提醒，建议仍用 Bark/PushDeer/APNs 之类的推送。

## 开源

本项目使用 MIT License。开源前请确认：

- `.env` 没有被提交。
- `ios/TokenBalanceMonitor/Shared/TokenMonitorConfig.swift` 没有被提交。
- 截图中没有真实 key、手机号、账单号或服务器密码。
- 如果你要公开部署移动端接口，请设置强随机 `MOBILE_API_TOKEN`，并优先使用 HTTPS。

## 开发

没有全局 `npm` 也没关系：

```bash
./scripts/install-deps.sh
./scripts/build.sh
```

添加新供应商时，新增 `server/providers/<name>.mjs`，再在 `server/providers/index.mjs` 注册即可。
