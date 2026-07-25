#!/usr/bin/env node
/**
 * PostToolUse hook (Bash) — refreshes the local Codex quota cache whenever a
 * codex plugin (codex-companion.mjs) invocation completes, so the terminal
 * statusline shows Codex's weekly limit without waiting for the next
 * statusline tick. Always exits 0 quickly; the actual quota fetch runs
 * detached so it never delays the tool call that triggered it. Shares a
 * debounce lock with the statusline's own periodic refresh (see
 * quota-statusline-bridge.mjs) so the two triggers don't double up.
 */
import { readFileSync } from "node:fs";
import process from "node:process";
import { triggerCodexQuotaRefresh } from "./lib/codex-quota-refresh-trigger.mjs";

let payload = {};
try {
  payload = JSON.parse(readFileSync(0, "utf8"));
} catch {
  process.exit(0);
}

if (payload.tool_name !== "Bash") process.exit(0);

const command = String(payload.tool_input?.command || "");
if (!command.includes("codex-companion.mjs")) process.exit(0);

triggerCodexQuotaRefresh();
