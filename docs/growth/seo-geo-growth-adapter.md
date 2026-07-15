# AI Meter SEO/GEO Growth Adapter

Updated: 2026-06-18

## Current Positioning

AI Meter 是一个开源、自托管的 AI 用量仪表盘仓库，后续按两个产品线运营：

- **AI Balance**：模型平台余额、credits、近 24h token 消耗和请求级 usage 归因。
- **AI Quota**：Codex / Claude Code 这类订阅制工具的 5 小时、每周额度窗口。

English definition:

> AI Meter is a self-hosted open-source AI usage dashboard with two separate product lines: AI Balance for provider balances and request-level token usage, and AI Quota for Codex / Claude Code subscription quota windows.

## Why The SEO Plan Changed

The previous public story treated Codex / Claude quota as a secondary feature of a balance monitor. That is no longer precise. The repository now contains two related but separate products that share infrastructure:

1. **AI Balance** answers "which provider account still has money, and which request consumed tokens?"
2. **AI Quota** answers "how much of my Codex / Claude Code subscription window is left, and when does it reset?"

These two search intents should not be merged under one keyword. Users searching for `DeepSeek 余额监控` and users searching for `Codex 额度` are trying to solve different problems.

## Domain Placement

- Hub canonical URL: `https://ai.meter.panyue.xyz/projects/token-balance-monitor/`
- AI Balance canonical URL: `https://ai.meter.panyue.xyz/projects/ai-balance/`
- AI Quota canonical URL: `https://ai.meter.panyue.xyz/projects/ai-quota/`
- Canonical host: `https://ai.meter.panyue.xyz`
- Project slug: keep `token-balance-monitor` as the hub / legacy entry to avoid losing existing GitHub and search references.
- Public route model: one AI Meter hub page plus one dedicated landing page per product line.
- Required public pages:
  - `/projects/token-balance-monitor/`: AI Meter hub and router.
  - `/projects/ai-balance/`: model provider balance and request-level token usage.
  - `/projects/ai-quota/`: Codex / Claude Code subscription quota windows.
- noindex routes: local dashboards, authenticated dashboards, internal API responses.
- Sitemap ownership: the `ai.meter.panyue.xyz` hub owns the sitemap.
- Deployment model: static public landing pages; app/service can remain this repository.
- Redirects: only redirect old paths after GitHub README, sitemap, canonical tags, analytics, and Search Console resubmission are ready.

## Product Lines

| Product line | Primary job | Public surfaces | SEO role |
|---|---|---|---|
| AI Balance | Provider balance, credits, token usage attribution | Web Dashboard, Agent Skill, macOS menu bar, iPhone App, iOS Widget, API docs | Main category page and GitHub value prop |
| AI Quota | Codex / Claude Code subscription quota windows | iPhone App, Apple Watch App, Watch complication, local bridge scripts, quota API docs | Dedicated secondary product line and long-tail intent |

## Audiences

| Audience | Looks for | Best entry |
|---|---|---|
| Multi-provider AI developers | Aliyun, DeepSeek, Kimi, Doubao, OpenRouter balance and usage visibility | AI Balance hero, README quick start |
| Agent / backend maintainers | Request-level token attribution without storing prompt/response | Agent Skill, usage API, privacy section |
| Codex / Claude Code heavy users | 5-hour / weekly quota visibility before hitting limits | AI Quota section, Watch docs, Xiaohongshu post |
| Self-hosted-first users | Provider keys and prompt content stay under their control | README privacy, landing FAQ, API auth docs |

## Search Intent Map

| Intent cluster | Chinese queries | English queries | Best surface | Vocabulary rule |
|---|---|---|---|---|
| AI Balance category | AI 模型余额监控, DeepSeek 余额监控, 阿里云百炼余额看板 | AI provider balance monitor, DeepSeek balance dashboard | Landing hero, README | Use `余额`, `credits`, `provider balance` |
| Token attribution | token 用量统计, 模型请求 token 来源, AI 成本分析 | LLM token usage dashboard, request-level token tracking | Landing workflow, API Reference | Use `token 用量`, `usage`, `request-level` |
| Agent workflow | Agent 查询余额, Agent 上报 token 用量 | agent token usage reporting, self-hosted usage events API | Agent docs, README | Keep prompt/response privacy explicit |
| AI Quota category | Codex 额度监控, Claude Code 额度, Claude 5 小时额度, Codex 每周额度 | Codex quota monitor, Claude Code rate limit monitor | AI Quota landing section, Watch docs | Use `订阅额度窗口`, `quota window`; do not call it balance |
| Watch surface | Apple Watch 看 Claude 额度, Apple Watch Codex 额度 | Apple Watch quota monitor | Watch docs, Xiaohongshu | Say foreground Watch App; complication is shortcut/recent snapshot |
| Privacy | 不保存 prompt 的 token 统计, 不上传 Claude 登录态 | self-hosted AI usage monitor privacy, no prompt storage | Landing FAQ, docs | Claims must match code and docs |

## Copy Rules

- Use `AI Meter` for the repository/product suite.
- Use `AI Balance` when talking about provider balances, credits, request usage, Web/macOS/iPhone balance surfaces, and usage events.
- Use `AI Quota` when talking about Codex / Claude Code quota windows, Watch App, Watch complication, and quota bridge scripts.
- Do not say Codex / Claude quota is a balance.
- Do not imply OpenAI or Anthropic web account scraping.
- Codex quota refresh can be live only where the service can access local Codex app-server credentials.
- Claude Code quota comes from status line data; it is not scraped from Claude web pages.
- If quota data is stale, copy must say `可能过期`.
- App Store / ASO is still out of scope unless a release plan is explicitly opened.

## Website Strategy

The website should no longer force both products into a single H1. Use a hub-and-spoke structure.

### Hub Page

H1:

```text
AI Meter：开源 AI 用量监控
```

Job:

- Explain that this repository contains two products.
- Route users to the correct landing page.
- Preserve legacy `token-balance-monitor` URL value.

### AI Balance Page

H1:

```text
模型平台余额与 token 用量监控
```

Job:

- Rank for model provider balance and token usage queries.
- Show provider support, workflow, privacy boundary, and API docs.
- Avoid mentioning Codex / Claude quota except as a separate product link.

### AI Quota Page

H1:

```text
Codex / Claude Code 订阅额度监控
```

Job:

- Rank for Codex / Claude Code quota, rate limit, 5-hour window, weekly quota and Watch use cases.
- Explain that quota windows are not provider balances.
- Show Apple Watch / iPhone / bridge flow and quota API.

Recommended hub structure:

1. Hero: AI Meter as the suite; two product-line cards for AI Balance and AI Quota.
2. Product line cards linking to dedicated pages.
3. Shared product proof and repository CTA.
4. Short privacy / self-hosted explanation.
5. GitHub and API docs links.

## Public Surface Updates

| Surface | Needed update | Status |
|---|---|---|
| GitHub README | Keep AI Meter top summary; emphasize two product lines and avoid calling quota a balance | In progress |
| Hub landing page | Keep AI Meter as suite entry; link to AI Balance and AI Quota product pages | Updated locally |
| AI Balance landing page | Add dedicated title, description, canonical, product copy, FAQ schema, proof visual | Updated locally |
| AI Quota landing page | Add dedicated title, description, canonical, product copy, FAQ schema, Watch proof visual | Updated locally |
| API Reference | Split API groups into AI Balance API and AI Quota API in intro/auth | In progress |
| Provider matrix | Rename as AI Balance provider matrix; quota section remains separate | In progress |
| Watch docs | Already uses AI Quota framing; keep it as the long-tail page | Current |
| Xiaohongshu | Needs new scene-first posts for two product lines, not one generic repo post | Planned |

## Material Diff

Changed surface:

- Landing page hero and product-line section.
- Watch / iPhone quota surfaces now belong to AI Quota, not a generic balance-monitor feature.

Changed user-facing UI:

- iPhone app has AI Balance and AI Quota sections.
- Apple Watch / complication are AI Quota surfaces.

Changed copy/terminology:

- Repository suite: AI Meter.
- Balance line: AI Balance.
- Subscription quota line: AI Quota.

Changed proof claim:

- Old claim: one monitor covers balance, token usage, and quota.
- New claim: one self-hosted service powers two separate product lines and keeps their accounting concepts separate.

Old assets still valid:

- Web dashboard screenshots for AI Balance.
- Agent terminal visual for usage/reporting.
- Provider matrix.
- Watch quota screenshot after removing model-specific label.

Old assets that must be recaptured or redesigned:

- Hero / OG image should eventually say AI Meter and show two product lines.
- Xiaohongshu carousel should be rebuilt around one concrete scene per post.

## Measurement

Baseline date for this strategy: 2026-06-18.

Track separately:

- Hub page visits and product-card click-through.
- AI Balance page visits and GitHub/API CTA clicks.
- AI Quota page visits and Watch/Claude docs CTA clicks.
- Docs visits for `subscription-quota-watch`, `claude-code-quota`, and `api-reference`.
- Query/referrer clusters containing `AI Meter`, `AI Balance`, `AI Quota`, `DeepSeek 余额`, `Codex 额度`, `Claude Code 额度`, `quota`.
- GitHub stars and referrers after publishing each product-line post.

Do not claim SEO lift until the page is deployed and at least one measurement window exists:

- 24-72h: crawler discovery and status codes.
- 7 days: early query discovery.
- 28 days: first meaningful comparison.

## Next Publishing Brief

Next GitHub update:

- Make AI Meter the visible repo identity.
- Keep `token-balance-monitor` repo URL stable.
- Add a short "Two product lines" block near the top.

Next landing update:

- Deploy hub page plus two product pages.
- Ensure nginx/static routing maps `/projects/ai-balance/` and `/projects/ai-quota/`.
- Submit updated sitemap with all three canonical URLs.

Next Xiaohongshu posts:

1. AI Quota scene: "写代码前先看 Codex / Claude 额度窗口，别等限速了才发现。"
2. AI Balance scene: "多个模型平台的余额和 token 消耗别再每天开 6 个控制台。"

Required proof assets:

- Readable Watch App / complication quota screenshot.
- Readable Web Dashboard usage screenshot.
- Terminal bridge screenshot with secrets hidden.

Manual inputs required:

- Logged-in Xiaohongshu examples for developer-tool posts, if competitor research is needed.
- Confirmation before deploying the landing page update.

## Growth Diff For This Change

Added intent:

- AI Meter as a two-product-line suite.
- AI Balance as the provider balance and usage product.
- AI Quota as the subscription quota product.

Changed claims:

- Codex / Claude quota is no longer framed as a feature under balance monitoring.
- Balance, usage, cost, and quota must be explained as different data types.

Updated public surfaces:

- Hub landing page metadata and hero.
- Dedicated AI Balance landing page.
- Dedicated AI Quota landing page.
- README top summary.
- API Reference introduction and auth table.
- Provider matrix title and quota separation.
- Project growth adapter.

New materials needed:

- Future AI Meter OG/GitHub social preview.
- Separate Xiaohongshu carousel plans for AI Balance and AI Quota.

Manual inputs required:

- Deployment confirmation.
- Xiaohongshu logged-in research samples if we need competitor-post analysis.

Measurement update:

- Track AI Balance and AI Quota query clusters separately under the same canonical landing page.

## Rules To Persist Back To Growth Foundation

- A feature split into product lines should be treated as a positioning change, not a normal feature launch.
- Keep the canonical URL stable unless a migration plan includes redirects, sitemap changes, and Search Console resubmission.
- For same-repo multi-product projects, the landing page can be a suite page, but each line needs its own vocabulary, proof assets, docs links, and measurement cluster.
- Do not let a new product line dilute an existing high-intent category; route both intents explicitly.
