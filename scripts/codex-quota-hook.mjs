#!/usr/bin/env node
/**
 * PostToolUse hook (Bash) — refreshes the local Codex quota cache whenever a
 * codex plugin (codex-companion.mjs) invocation completes, so the terminal
 * statusline shows Codex's weekly limit without spawning `codex app-server`
 * on every render. Always exits 0 quickly; the actual quota fetch runs
 * detached so it never delays the tool call that triggered it.
 */
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let payload = {};
try {
  payload = JSON.parse(readFileSync(0, "utf8"));
} catch {
  process.exit(0);
}

if (payload.tool_name !== "Bash") process.exit(0);

const command = String(payload.tool_input?.command || "");
if (!command.includes("codex-companion.mjs")) process.exit(0);

const bridge = path.join(__dirname, "codex-quota-bridge.mjs");
const child = spawn(process.execPath, [bridge], {
  detached: true,
  stdio: "ignore",
  env: process.env
});
child.unref();
