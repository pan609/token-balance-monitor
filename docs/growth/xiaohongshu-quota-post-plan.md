# 小红书发布方案：AI Quota / Apple Watch 额度窗口

更新日期：2026-06-18

这是本项目的发布 brief。当前还没有完成登录态小红书竞品检索，所以它是第一版内容方向，不是最终发帖稿。

## 目标

用 **AI Quota** 这条独立产品线，触达写代码时经常遇到订阅额度、rate limit、5 小时窗口不透明问题的开发者。

核心场景：

> 写代码写到一半，Codex 或 Claude Code 快接近 5 小时额度限制；抬手看 Apple Watch，先确认剩余窗口和重置时间。

## 定位

应该：

- 使用 `订阅额度窗口`、`5 小时`、`每周`、`重置时间` 这类清晰词。
- 解释 AI Balance 的 API Key 余额和 AI Quota 的订阅额度不是一回事。
- 展示真实产品状态，或用 simulator / mock 数据跑出来的真实界面。
- 把帖子写成一个开发者工作流笔记，而不是产品广告。

不要：

- 把 Codex / Claude 的额度窗口说成“余额”。
- 暗示 Apple Watch 表盘小组件能稳定实时刷新。
- 暗示它会读取 Claude / OpenAI 登录数据。
- 开头就说“我做了一个开源项目”。

## 轮播草稿

| 页码 | 画面 | 文案 | 证明素材 |
|---|---|---|---|
| 1 | Apple Watch 额度界面，放大剩余比例和重置时间 | 写代码时，最怕额度快到限制才发现 | Watch App simulator / mock 数据 |
| 2 | API 余额 vs 订阅额度窗口的对比图 | 余额回答“还剩多少钱”；额度窗口回答“这轮还能用多久” | 产品文档 |
| 3 | Codex bridge 终端，命令和输出要清晰可读 | Codex 通过本机 bridge 读取 rate limit | `scripts/codex-quota-bridge.mjs` |
| 4 | Claude Code status line 上报流程 | Claude Code 用 status line 上报，不保存登录态 | `docs/claude-code-quota.md` |
| 5 | Watch 数据新鲜 / 可能过期两个状态 | 数据过期时明确显示“可能过期” | Watch UI + quota API |
| 6 | GitHub CTA、文档链接 | AI Meter 里 AI Balance / AI Quota 分开做 | README + API docs |

## 标题候选

- 我给 Codex / Claude 做了个 Apple Watch 额度窗口
- 写代码前先看一眼：Codex / Claude 还剩多少额度
- 别把"余额"和"订阅额度"混在一起看

## 正文草稿

我把 AI Meter 拆成了两条线：AI Balance 看 API Key 余额和 token usage；AI Quota 专门看 Codex / Claude Code 的订阅额度窗口。

AI Quota 不是查 API Key 余额，而是看 Codex / Claude Code 这类订阅工具的 5 小时、每周额度窗口：剩余百分比、重置时间、数据是否过期。

我把它做成 Apple Watch 前台 App 的原因很简单：表盘小组件刷新不稳定，真要确认就应该打开 App 主动刷新。Claude Code 走 status line 上报，Codex 走本机 bridge，上报到自己的服务端。

代码开源，自托管，prompt / response 不进入监控服务。

## 标签

`#ClaudeCode` `#Codex` `#AI工具` `#程序员工具` `#开源项目` `#AppleWatch` `#效率工具` `#LLM`

## 素材要求

可自动或半自动生成：

- 使用 mock quota 数据运行 Watch App simulator 截图。
- 截取 Codex bridge 终端输出，确保 JSON 可读、无密钥。
- 生成 Claude Code status line bridge 流程图。
- 生成一张 GitHub / README 预览图。

需要人工补充：

- 登录态小红书里，同类开发者工具帖子的搜索样本。
- 可选真实 Apple Watch 设备照片；只有它明显增强可信度时才需要，UI 证明用 simulator 截图即可。

## 复盘计划

- 24 小时：记录曝光、阅读、收藏、主页访问、GitHub/官网点击。
- 72 小时：对比上一条开发者工具帖的标题和封面表现。
- 7 天：决定下一条发 Claude Code 接入、Codex bridge，还是 token usage 看板。
