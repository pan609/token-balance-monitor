# SEO 统计与复盘方案

更新日期：2026-06-17

本方案用于统计 `https://ai.meter.panyue.xyz/projects/token-balance-monitor/` 部署后对搜索和 GitHub 增长的贡献。

## 当前已具备的统计入口

| 指标 | 数据来源 | 用法 |
|---|---|---|
| landing 访问量 | Nginx `/var/log/nginx/panyue-hub.access.log` | 统计 `/projects/token-balance-monitor/` 的 HTML 访问 |
| 搜索爬虫访问 | Nginx User-Agent | 观察 Googlebot、Bingbot、Baiduspider 等是否抓取 |
| GitHub 出站点击 | `/go/token-balance-monitor-github` 302 日志 | 统计 landing 到 GitHub 的主 CTA 点击 |
| sitemap 可访问性 | `https://ai.meter.panyue.xyz/sitemap.xml` | 发布后确认 `lastmod` 和 200 状态 |
| 索引提交 | IndexNow | 重要页面更新后提交 canonical URL 和 sitemap |

当前没有接入第三方前端埋点，因此不会记录 cookie、用户行为轨迹或 prompt/response 数据。

## 快速生成日志报告

服务器实时报告：

```bash
ssh deploy@your-server.example 'sudo cat /var/log/nginx/panyue-hub.access.log' \
  | npm run seo:report -- --since 2026-06-17T00:00:00+08:00
```

本地文件报告：

```bash
npm run seo:report -- --file ./panyue-hub.access.log --json
```

报告重点看：

- `Human pageviews`：排除常见爬虫后的页面访问。
- `GitHub clicks`：用户是否从 landing 点到 GitHub。
- `Search referrers`：是否出现 Google、Bing、Baidu 等自然搜索来源。
- `Bots`：搜索引擎是否抓取过页面。

## 7 天复盘

时间窗口：上线后第 7 天。

需要回答：

- landing 是否有自然搜索 referrer。
- 是否出现 Googlebot / Bingbot / Baiduspider 抓取。
- GitHub CTA 点击是否有增长。
- GitHub stars、forks、referrers 是否有变化。
- `Codex`、`Claude`、`额度`、`quota` 相关查询是否出现。

## 28 天复盘

时间窗口：上线后第 28 天。

需要回答：

- 搜索来源是否稳定出现。
- landing 到 GitHub 的点击率是否值得继续优化首屏 CTA。
- 订阅额度窗口相关内容是否带来新的长尾访问。
- 小红书发布后是否有 referral、直接访问或 GitHub star 波动。

## 需要人工完成的统计补充

- Google Search Console：添加 `ai.meter.panyue.xyz` 域名资源，提交 sitemap。
- Bing Webmaster Tools：提交 sitemap，也可通过 IndexNow 加速。
- GitHub Insights：每周记录 `Traffic -> Referring sites` 和 `Popular content`。
- 小红书：发帖后记录曝光、阅读、收藏、主页访问和外部访问变化。

## 功能变更后的统计规则

每次新功能导致 SEO 内容更新时，都要记录：

```text
上线日期：
变更功能：
主 URL：
新增查询簇：
主 CTA：
7 天复盘日期：
28 天复盘日期：
需要手动导出的后台数据：
```

例如 Apple Watch / Codex / Claude 额度窗口这次更新，应单独观察 `Codex 额度`、`Claude Code 额度`、`Apple Watch quota`，不要只看原来的 `AI 余额监控` 查询。
