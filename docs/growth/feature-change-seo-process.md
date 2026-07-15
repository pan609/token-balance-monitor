# Feature Change SEO/GEO Response Process

Updated: 2026-06-17

This process is intended to be copied back into the SEO skill repository as a reusable rule set.

## Trigger

Run this process whenever a project adds, removes, renames, or materially changes:

- product surfaces: Web, mobile, desktop, widget, watch, CLI, agent skill;
- supported providers or platforms;
- API endpoints or integration contracts;
- data model, privacy boundary, or authentication model;
- screenshots, demo data, landing media, or README previews;
- pricing, store status, open-source status, deployment model;
- target growth channel: GitHub, website SEO, GEO, ASO, Xiaohongshu, docs SEO.

## Step 0: Capture The Product Diff

Before deciding content, write a compact product diff:

```text
Changed feature:
Changed user job:
Changed public surface:
Changed data/privacy boundary:
Changed proof assets:
Changed growth channel priority:
```

If the feature is still experimental or local-only, mark that clearly. Do not let an internal prototype become a public claim by accident.

## Step 1: Classify The Feature Change

Use this table before editing copy:

| Change type | SEO implication | Required action |
|---|---|---|
| New core job | May change hero and primary keywords | Re-evaluate positioning |
| New secondary use case | Adds a section and long-tail docs | Keep hero stable, add storyline |
| New platform surface | Adds screenshots and platform keywords | Update surfaces, media, README |
| New provider | Adds provider-specific long-tail queries | Update provider matrix and docs |
| New API | Adds integration search intent | Update API Reference and examples |
| New privacy boundary | Changes trust copy | Update FAQ/security claims |
| Product-line split | Changes positioning, navigation, measurement, and asset taxonomy | Rewrite adapter around product lines; keep canonical URL stable until migration is planned |
| Removed feature | Prevents outdated claims | Remove copy, screenshots, schema references |

## Step 1.5: Choose Channel Response

Every feature change should produce a channel decision, not necessarily a channel update.

| Channel | Update when | Typical output |
|---|---|---|
| Landing page | The feature changes positioning, proof, trust, or conversion | Hero change only for a new core job; otherwise a secondary section, FAQ, CTA, schema update |
| GitHub README | The feature changes install value, supported surfaces, API, or open-source credibility | Top summary, surface table, quick-start link, docs link, preview asset |
| API Reference | The feature adds or changes public endpoints or auth tokens | Endpoint contract, examples, error table, security notes |
| Long-tail docs | The feature has setup complexity or searchable integration intent | Dedicated setup guide with constraints and troubleshooting |
| Xiaohongshu | The feature creates a concrete scene people can recognize in one image | One problem-first post plan with proof asset requirement |
| Screenshot/material package | The feature changes UI, device surface, or claim proof | Regenerate screenshots from real/mock-data product state before composing marketing visuals |
| Indexing/measurement | The public URL or query cluster changed | Sitemap lastmod, IndexNow/Search Console resubmission, query cluster baseline |

## Step 2: Decide Whether The Hero Changes

Only change the landing page hero when all are true:

1. The new feature is more important than the old core job.
2. It creates a broader category than the old positioning.
3. README, docs, and user intent all support the new story.

Otherwise, keep the hero and add a lower-page section. This prevents every feature release from turning the landing page into a crowded changelog.

If the change splits one product into multiple product lines, the hero may change from a single-feature category to a suite/category framing. In that case, each product line still needs its own:

- vocabulary;
- primary user job;
- proof assets;
- docs links;
- CTA;
- query cluster;
- measurement bucket.

Do not buy or switch to a new slug/domain until redirects, sitemap, canonical tags, GitHub links, and Search Console resubmission are part of the migration plan.

## Step 3: Update The Search Intent Map

For every feature, add or revise:

- Chinese search queries.
- English search queries.
- best landing/docs surface.
- whether the intent is category, problem, integration, provider, privacy, or platform.

If the new intent is semantically different from existing terms, define vocabulary rules. Example:

- Provider account money: use `余额`.
- Request usage: use `token 用量`.
- Codex / Claude subscription limit: use `订阅额度窗口` or `quota window`.

## Step 4: Update Public Surfaces

Minimum checklist:

- README top description and surface table.
- Canonical landing page.
- API Reference if the feature adds public endpoints.
- Long-tail docs for setup-heavy features.
- Provider/platform matrix if claims changed.
- FAQ/privacy copy if data handling changed.
- Sitemap/indexing plan if a new public URL exists.

Do not expose internal implementation details in marketing copy. Convert internal constraints into user-facing facts.

## Step 5: Update Materials

Classify material needs:

| Material | Auto | Semi-auto | Manual |
|---|---:|---:|---:|
| Clean product screenshot from local app/simulator | Yes |  |  |
| Mock data for screenshots | Yes |  |  |
| Marketing composition around real screenshot | Yes |  |  |
| App Store screenshots |  | Yes |  |
| Xiaohongshu carousel |  | Yes |  |
| Real user proof, metrics, testimonials |  |  | Yes |

Rule: product interior must match a real product state or mock-data render. Generated/design layers can improve framing, device chrome, motion, background, and focus.

## Step 6: Update Measurement

Every SEO-relevant feature change should define:

- canonical URL(s);
- CTA(s) to track;
- query clusters to monitor;
- baseline date;
- 7-day and 28-day review windows;
- whether IndexNow, Search Console, Bing Webmaster, or Baidu needs resubmission.

If there is no new public URL, do not submit a new sitemap just to announce a feature. Update the existing page and use normal recrawl/indexing tools.

## Step 7: Create A Growth Diff

Produce a short "growth diff" before finalizing:

```text
Added intent:
- ...

Changed claims:
- ...

New/updated public surfaces:
- ...

New materials needed:
- ...

Manual inputs required:
- ...

Measurement update:
- ...
```

This diff is what should be committed back to a project-specific growth adapter or shared with the user before larger asset work.

## Step 7.5: Create The Next Publishing Brief

For each meaningful release, produce one next-channel brief. It keeps the SEO plan from becoming only docs maintenance.

```text
Next GitHub update:
Next landing update:
Next Xiaohongshu post:
Required proof asset:
Manual input still needed:
7-day measurement:
```

The Xiaohongshu brief must be scene-first, for example "Apple Watch 上确认 Codex / Claude 额度是否快到限制", not "我做了一个开源项目".

## Step 8: Guardrails

- Do not invent user counts, rankings, savings percentages, stars, downloads, or testimonials.
- Do not claim a feature is real-time when it depends on local bridges, OS scheduling, or stale snapshots.
- Do not mix billing balance, token usage, API cost, and subscription quota under one word.
- Do not publish screenshots with secrets, account IDs, real customer data, prompt text, or response text.
- Do not make App Store / ASO plans for iOS or Watch unless release is explicitly in scope.
- Do not let feature-driven SEO updates break the existing strongest search intent.

## Skill Rule Summary

When a user says "功能更新了，SEO 是否要更新", the skill should:

1. Scan the latest repo diff and docs.
2. Identify new search intent clusters.
3. Decide hero change vs secondary section.
4. Update the project growth adapter.
5. List concrete landing/docs/material/indexing changes.
6. Separate automatically generated materials from manual inputs.
7. Output reusable rules for the growth foundation.
