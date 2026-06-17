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
| Removed feature | Prevents outdated claims | Remove copy, screenshots, schema references |

## Step 2: Decide Whether The Hero Changes

Only change the landing page hero when all are true:

1. The new feature is more important than the old core job.
2. It creates a broader category than the old positioning.
3. README, docs, and user intent all support the new story.

Otherwise, keep the hero and add a lower-page section. This prevents every feature release from turning the landing page into a crowded changelog.

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
