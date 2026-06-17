# Token Balance Monitor SEO/GEO Growth Adapter

Updated: 2026-06-17

## Current Positioning

Token Balance Monitor 是一个开源、自托管的模型平台余额、请求级 token 用量和订阅额度窗口监控工具。

English definition:

> Token Balance Monitor is a self-hosted open-source monitor for AI provider balances, request-level token usage, and subscription quota windows across Web, macOS, iPhone, Apple Watch, and agent workflows.

## Why The SEO Plan Changed

The product has moved from a single "AI provider balance monitor" story into two related but distinct jobs:

1. **API Key balance and usage visibility**: provider balance, 24h usage, request-level token attribution.
2. **Subscription quota visibility**: Codex and Claude Code 5-hour / weekly quota windows, surfaced through Apple Watch and local bridge scripts.

These should share the same product brand, but SEO pages and social posts should not mix the concepts too early. A user searching for "Claude Code 额度" has a different intent from a user searching for "DeepSeek 余额监控".

## Growth Targets

1. GitHub growth.
2. Public website SEO under `https://panyue.xyz/projects/token-balance-monitor/`.
3. Developer long-tail docs.
4. Xiaohongshu publishing.

ASO remains paused. Apple Watch and iOS App Store metadata should not be treated as store growth work until there is an App Store release plan.

## Surface Inventory

| Surface | Current state | SEO/GEO action |
|---|---|---|
| GitHub README | Includes Web, Agent, macOS, iPhone, Apple Watch quota, Claude Code bridge | Keep README as the broad product overview; avoid making the first paragraph too crowded |
| Public landing page | Canonical page already deployed on `panyue.xyz`; current public copy may lag behind quota features | Add a secondary section for subscription quota monitoring, not a hero replacement |
| API Reference | Covers balance, usage, and quota APIs | Keep quota vocabulary separate from balance vocabulary |
| Apple Watch quota doc | New long-tail doc for watchOS quota use case | Treat as a developer doc page and source for posts |
| Claude Code quota doc | New long-tail doc for status line bridge | Treat as high-intent long-tail content |
| Provider matrix | Correctly separates API billing/cost from simple balances | Extend with subscription quota category if needed |
| Xiaohongshu | Not yet researched with logged-in search | Use problem-first posts: "Codex/Claude 额度快耗尽看不到" rather than generic app promo |

## Search Intent Map

| Intent cluster | Chinese queries | English queries | Best surface |
|---|---|---|---|
| Balance monitor | AI 模型余额监控, DeepSeek 余额监控, 阿里云百炼余额看板 | AI provider balance monitor, DeepSeek balance dashboard | Landing page, README |
| Token attribution | token 用量统计, 模型请求 token 来源, AI 成本分析 | LLM token usage dashboard, request-level token tracking | Landing page, Agent docs, API Reference |
| Agent workflow | Agent 查询余额, Codex 上报 token 用量 | agent token usage reporting, self-hosted usage events API | Agent docs, README |
| Subscription quota | Codex 额度监控, Claude Code 额度, Claude 5 小时额度, Codex 每周额度 | Codex quota monitor, Claude Code rate limit monitor | Watch quota doc, Claude Code quota doc, landing secondary section |
| Watch surface | Apple Watch 看 Claude 额度, Apple Watch Codex 额度 | Apple Watch quota monitor | Watch quota doc, Xiaohongshu posts |
| Privacy | 不保存 prompt 的 token 统计, 不上传 Claude 登录态 | self-hosted AI cost monitor privacy, no prompt storage | Landing FAQ, quota docs |

## Copy Rules For New Quota Features

- Say "订阅额度窗口" or "quota window", not "余额", when talking about Codex / Claude Code subscription limits.
- Do not imply the project logs into Claude or OpenAI cloud accounts on the server.
- Codex quota refresh can be live only when the service runs where Codex app-server credentials are available.
- Claude Code quota is received from the local status line bridge; it is not scraped from Claude web pages.
- Apple Watch should be described as a foreground app for checking freshness, not as a guaranteed real-time complication.
- If quota data is stale, copy must say "可能过期"; do not present stale snapshots as live status.

## Website Update Recommendation

The existing landing page should keep the current hero focused on:

> 模型平台余额与 Token 用量监控

Add a second product storyline below the first proof section:

### Suggested Section

Title:

```text
也能看 Codex / Claude Code 的订阅额度窗口
```

Body:

```text
API Key 余额回答账户还剩多少钱；订阅额度窗口回答 Codex 或 Claude Code 在 5 小时、每周周期里还剩多少可用空间。Token Balance Monitor 用独立 quota 通道接收本机 bridge 上报，并在 Apple Watch 上显示新鲜度、剩余比例和重置时间。
```

Bullets:

- Codex 可由本机 bridge 读取 rate limit 后上报。
- Claude Code 通过 status line 输出 quota 字段，不保存账号密码或登录态。
- Watch App 前台刷新；数据过期时明确显示可能过期。

CTA:

- `Apple Watch 额度监控文档` -> `docs/subscription-quota-watch.md`
- `Claude Code 接入` -> `docs/claude-code-quota.md`

## Material Gaps

| Asset | Can generate automatically? | Needed for better SEO/social |
|---|---:|---|
| Watch App screenshot with mock quota data | Yes, from watchOS simulator | Needed before publishing Watch section visually |
| Claude Code status line terminal screenshot | Semi-automatic | Good for docs/social proof |
| Landing section concept image | Yes, outer composition can be designed | Useful after real Watch screenshot exists |
| Xiaohongshu carousel | Semi-automatic | Needs competitor research and final screenshots |
| API docs update | Yes | Completed for `GET /api/quota/summary`, `POST /api/quota/refresh`, `POST /api/quota/snapshots` |

## Measurement Update

Track quota-related impact separately:

- landing page views;
- docs page views for `subscription-quota-watch` and `claude-code-quota`;
- GitHub visits from quota CTAs;
- searches/referrers containing `Codex`, `Claude`, `额度`, `quota`, `rate limit`;
- stars after publishing quota-related posts.

Do not judge quota SEO success by the original balance keywords alone.

## Growth Diff For This Feature Update

Added intent:

- Codex / Claude Code subscription quota monitoring.
- Apple Watch foreground app for quota freshness.
- Claude Code status line bridge and Codex local bridge.

Changed claims:

- The product is no longer only "AI provider balance + token usage"; it also has a separate subscription quota channel.
- Codex / Claude quota must not be described as provider balance.
- Live freshness is conditional on local bridge availability and stale snapshot handling.

New/updated public surfaces:

- README surface table already includes Apple Watch quota and Claude Code bridge.
- `docs/subscription-quota-watch.md`.
- `docs/claude-code-quota.md`.
- `docs/api-reference.md` quota API section.
- Future landing page secondary section under the existing canonical page.

New materials needed:

- Watch App screenshot from simulator with mock quota data.
- Terminal/status line screenshot for Claude Code bridge.
- One landing page visual composition using real/mock-data quota screens.

Manual inputs required:

- Logged-in Xiaohongshu search examples or browser access for competitor post analysis.
- Real screenshots only if mock/simulator screenshots are not representative enough.

Measurement update:

- Track quota-related queries and docs visits separately from balance-monitor queries.
- Re-submit the canonical landing URL after the landing page copy changes; do not create a new sitemap URL unless new public docs are hosted on the website.

## Rules To Persist Back To Growth Foundation

- Product feature changes should trigger an SEO/GEO impact review before new features are announced.
- When a new feature creates a new search intent cluster, add it as a secondary storyline first unless it becomes the product's primary job.
- Do not overwrite existing ranking intent with a new feature if the old hero still matches the broader category.
- For features that are adjacent but semantically different, such as balance vs subscription quota, enforce copy vocabulary rules.
- Every new public feature should update at least one of: README, landing page, API docs, long-tail docs, sitemap/indexing plan, screenshot/material plan, social post plan.
- If the repo removes or relocates landing assets, the SEO plan must record where the canonical website is now maintained.
