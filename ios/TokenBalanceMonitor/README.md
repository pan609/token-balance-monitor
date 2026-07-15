# AI Meter for iOS

这是一个轻量 SwiftUI + WidgetKit / watchOS 工程。iPhone 主 App 叫 `AI Meter`，里面包含两条线：

- `AI Balance`：查看模型平台余额、重点关注平台和低余额提醒。
- `AI Quota`：查看 Codex / Claude Code 的订阅额度窗口，并给 Apple Watch 做中继。

## 结构

- `TokenBalanceMonitor/`：主 App，打开即可刷新余额和订阅额度。
- `TokenBalanceWidget/`：桌面小组件，可选择显示总余额、重点关注或某个平台余额。
- `TokenBalanceWatch/`：Apple Watch App，前台查看 Codex / Claude 额度。
- `TokenBalanceWatchComplication/`：Watch 表盘复杂功能，显示最近快照并作为快捷入口。
- `Shared/`：API、数据模型和本地配置。
- `project.yml`：XcodeGen 工程配置。

`Shared/TokenMonitorConfig.swift` 会由 `scripts/generate-ios-config.sh` 从根目录 `.env` 生成，包含移动端 API 地址和 token，已加入 `.gitignore`。

## 运行

从项目根目录运行：

```bash
./scripts/run-ios-simulator.sh
```

默认使用 `iPhone 16 Pro` 模拟器。要换设备：

```bash
IOS_DEVICE_NAME="iPhone 17" ./scripts/run-ios-simulator.sh
```

或者指定 UDID：

```bash
IOS_SIM_UDID="859451EE-C392-429B-A12E-93F5A2501F28" ./scripts/run-ios-simulator.sh
```

脚本会在启动前检查其它已经开着的模拟器；如果发现其它模拟器也安装了这个项目的 App，会自动关闭它，保证同一个项目只保留一个模拟器实例。

## 安装到真机

先在 Xcode 里登录 Apple ID，并让 `com.panyue.TokenBalanceMonitor` 与 `com.panyue.TokenBalanceMonitor.widget` 可以自动签名。公开发布或 fork 后建议先在 `project.yml` 里改成自己的 Bundle ID。之后从项目根目录运行：

```bash
./scripts/run-ios-device.sh
```

如果只连接了一台 iPhone，脚本会自动选择它；多台设备时可指定：

```bash
IOS_DEVICE_ID=设备ID ./scripts/run-ios-device.sh
```

如果命令行无法自动选择签名团队，可传入自己的 Team ID：

```bash
IOS_DEVELOPMENT_TEAM=你的TeamID ./scripts/run-ios-device.sh
```

真机安装必须依赖 Apple provisioning profile。如果命令提示 `No Account for Team` 或 `No profiles`，请打开 Xcode 的 Settings > Accounts 登录 Apple ID，或在 Signing & Capabilities 里选择 Team。

## 小组件

主 App 在前台打开时会每 1 分钟自动刷新一次。

构建安装后，模拟器或真机主屏幕长按添加小组件，搜索 `AI Balance`、`AI Quota` 或 `AI Meter`。WidgetKit 的后台刷新频率由 iOS 调度，代码里请求每 15 分钟刷新一次，但系统可能按电量、网络和使用情况调整，不能保证每分钟后台刷新。

在 Simulator 里添加：

1. 按 `Shift + Command + H` 回到主屏幕。
2. 长按主屏幕空白处，进入编辑模式。
3. 点左上角 `+`。
4. 搜索 `AI Balance` 或 `AI Quota`，如果搜不到再试 `AI Meter` 或 `TokenBalanceMonitor`。
5. 选择小号或中号尺寸，点添加。

如果小组件图库里仍然看不到，先运行一次 App，再回到主屏幕等十几秒；还不出现的话，关掉并重新启动同一个模拟器后再试。脚本会保证同项目只保留一个模拟器实例。

`AI Balance` 小组件添加后，可以长按这个小组件，选择“编辑小组件”，在“显示”里切换：

- 重点关注
- 阿里云
- Kimi
- DeepSeek
- 硅基流动
- 豆包
- OpenRouter
- 总余额

`AI Quota` 小组件也支持小号和中号：

- 小号：显示重点服务或指定服务的 5 小时剩余额度。
- 中号：同时显示 5 小时和每周额度窗口、重置时间和最近同步状态。
- 编辑小组件时可以选择“重点关注 / Codex / Claude”。

`AI Balance` 的“重点关注”跟随服务端 `.env` 的 `PRIMARY_PROVIDER_ID`；其它选项是固定显示某个平台。`AI Quota` 的“重点关注”跟随 quota summary 返回的 `primaryServiceId`，通常是 `codex` 或 `claude`。

主 App 里可以直接切换重点关注平台：

1. 打开 `AI Meter`。
2. 点首页“重点关注平台”卡片右侧的切换按钮，或点右上角齿轮。
3. 选择阿里云、DeepSeek、豆包等平台。

保存成功后，App 会刷新当前余额并请求小组件刷新。已经添加的小组件如果固定选择了某个平台，就不会跟随；把小组件的“显示”改成“重点关注”即可同步。

如果新增了服务端 provider，并希望小组件也能直接选择它，请在 `TokenBalanceWidget/BalanceWidgetConfigurationIntent.swift` 增加一个 `BalanceWidgetDisplay` 枚举值。主 App 的平台列表会自动展示 `/api/mobile/summary` 返回的 provider。

## 提醒

主 App 打开或手动刷新时，如果重点关注平台的 CNY 余额低于 `.env` 里的 `MOBILE_ALERT_THRESHOLD_CNY`，会请求通知权限并发送本地提醒。持续后台主动推送更适合下一步接 Bark、PushDeer 或 APNs。
