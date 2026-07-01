#!/usr/bin/env node
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const DEFAULT_TIMEOUT_MS = 30000;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const bridgePath = path.join(__dirname, "claude-quota-bridge.py");

if (isMainModule()) {
  await main();
}

export async function collectClaudeQuotaSnapshots({ timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const snapshot = await runBridge(["--json"], { timeoutMs });
  if (snapshot?.ok === false) {
    throw new Error(snapshot.message || "Claude quota unavailable");
  }
  return Array.isArray(snapshot) ? snapshot : [snapshot];
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const shouldPost = args.has("--post");
  const timeoutMs = Number(getArgValue("--timeout-ms") || process.env.CLAUDE_QUOTA_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);

  try {
    const bridgeArgs = args.has("--set-cookie")
      ? ["--set-cookie"]
      : args.has("--raw")
        ? ["--raw"]
        : ["--json"];
    if (shouldPost) bridgeArgs.push("--post");
    const result = await runBridge(bridgeArgs, {
      timeoutMs,
      parseJSON: !args.has("--set-cookie"),
      interactive: args.has("--set-cookie")
    });

    if (args.has("--set-cookie")) {
      return;
    }

    if (args.has("--raw") || args.has("--json")) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      const snapshot = Array.isArray(result) ? result[0] : result;
      console.log(formatStatusLine(snapshot));
    }
  } catch (error) {
    if (args.has("--raw") || args.has("--json")) {
      console.log(JSON.stringify({ ok: false, message: error.message }, null, 2));
    } else {
      console.log(`Claude 额度读取失败：${error.message}`);
    }
    process.exitCode = 1;
  }
}

function runBridge(args, { timeoutMs, parseJSON = true, interactive = false }) {
  return new Promise((resolve, reject) => {
    const python = resolvePython();
    const child = spawn(python, [bridgePath, ...args], {
      env: process.env,
      stdio: interactive ? "inherit" : ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      finish(new Error(`timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", finish);
    child.on("exit", (code) => {
      if (settled) return;
      if (code !== 0) {
        finish(new Error(stderr.trim() || stdout.trim() || `python bridge exited with code ${code}`));
        return;
      }
      if (!parseJSON) {
        finish(null, null);
        return;
      }
      try {
        finish(null, JSON.parse(stdout));
      } catch (error) {
        finish(new Error(`invalid Claude bridge JSON: ${error.message}`));
      }
    });

    function finish(error, value) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill("SIGTERM");
      if (error) {
        reject(error);
      } else {
        resolve(value);
      }
    }
  });
}

function resolvePython() {
  if (process.env.CLAUDE_QUOTA_PYTHON) return process.env.CLAUDE_QUOTA_PYTHON;

  const legacyVenvPython = path.join(process.env.HOME || "", "claude-usage-pet", ".venv", "bin", "python");
  if (existsSync(legacyVenvPython)) return legacyVenvPython;

  return process.env.PYTHON || "python3";
}

function formatStatusLine(snapshot) {
  if (!snapshot || snapshot.ok === false) return "Claude 额度待同步";
  const window = snapshot.windows?.[0];
  const remaining = Number.isFinite(window?.remainingPercent)
    ? `${Math.round(window.remainingPercent)}%`
    : "--";
  return `${snapshot.serviceName || "Claude"} ${window?.label || "额度"} ${remaining}`;
}

function getArgValue(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}

function isMainModule() {
  return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}
