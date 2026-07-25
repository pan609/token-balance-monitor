#!/usr/bin/env node
/**
 * Stop hook — fires once when Claude Code finishes responding to a turn,
 * for plain `claude` and `claudex` sessions alike (hooks are registered
 * globally). Lazily refreshes the Codex quota cache once per completed
 * turn instead of polling on a timer. Always exits 0 quickly; the actual
 * quota fetch runs detached. Shares the debounce lock with the
 * codex-companion.mjs PostToolUse hook (see codex-quota-hook.mjs) so a
 * mid-turn codex delegation immediately followed by Stop won't double-fire.
 */
import { triggerCodexQuotaRefresh } from "./lib/codex-quota-refresh-trigger.mjs";

triggerCodexQuotaRefresh();
