#!/usr/bin/env node
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const DEFAULT_TIMEOUT_MS = 10000;

if (isMainModule()) {
  await main();
}

export async function collectCodexQuotaSnapshots({ timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const response = await readCodexRateLimits({ timeoutMs });
  return buildSnapshots(response.result);
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const ingestURL =
    getArgValue("--url") ||
    process.env.TOKEN_MONITOR_QUOTA_URL ||
    process.env.QUOTA_INGEST_URL ||
    process.env.TOKEN_MONITOR_INGEST_URL ||
    "";
  const token =
    getArgValue("--token") ||
    process.env.TOKEN_MONITOR_QUOTA_TOKEN ||
    process.env.QUOTA_INGEST_TOKEN ||
    process.env.TOKEN_MONITOR_INGEST_TOKEN ||
    "";
  const timeoutMs = Number(getArgValue("--timeout-ms") || process.env.CODEX_QUOTA_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);

  try {
    const response = await readCodexRateLimits({ timeoutMs });
    const snapshots = buildSnapshots(response.result);

    if (snapshots.length > 0 && ingestURL && !args.has("--no-post")) {
      await postSnapshots(ingestURL, token, snapshots);
    }

    if (args.has("--raw")) {
      console.log(JSON.stringify(response.result, null, 2));
    } else if (args.has("--json")) {
      console.log(JSON.stringify(snapshots.length === 1 ? snapshots[0] : snapshots, null, 2));
    } else {
      console.log(formatStatusLine(snapshots));
    }
  } catch (error) {
    if (args.has("--json") || args.has("--raw")) {
      console.log(JSON.stringify({ ok: false, message: error.message }, null, 2));
    } else {
      console.log(`Codex 额度读取失败：${error.message}`);
    }
    process.exitCode = 1;
  }
}

export function readCodexRateLimits({ timeoutMs }) {
  return new Promise((resolve, reject) => {
    const codexCommand = process.env.CODEX_CLI_PATH || "codex";
    const child = spawn(
      codexCommand,
      ["-c", "service_tier=\"fast\"", "app-server", "--listen", "stdio://"],
      {
        stdio: ["pipe", "pipe", "pipe"],
        env: {
          ...process.env,
          TERM: process.env.TERM && process.env.TERM !== "dumb" ? process.env.TERM : "xterm-256color"
        }
      }
    );

    let stdoutBuffer = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      finish(new Error(`timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    child.on("error", finish);
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.stdout.on("data", (chunk) => {
      stdoutBuffer += chunk.toString("utf8");
      const lines = stdoutBuffer.split(/\r?\n/);
      stdoutBuffer = lines.pop() || "";
      for (const line of lines) {
        const message = parseJSONLine(line);
        if (!message) continue;
        if (message.id === 2 && message.result) {
          finish(null, message);
        } else if (message.id === 2 && message.error) {
          finish(new Error(message.error.message || JSON.stringify(message.error)));
        }
      }
    });
    child.on("exit", (code) => {
      if (!settled) {
        finish(new Error(`codex app-server exited with code ${code ?? "unknown"}${stderr ? `: ${stderr.trim()}` : ""}`));
      }
    });

    writeMessage(child, {
      id: 1,
      method: "initialize",
      params: {
        clientInfo: {
          name: "token-balance-monitor",
          title: "Token Balance Monitor",
          version: "0.1.0"
        },
        capabilities: {
          experimentalApi: true,
          optOutNotificationMethods: []
        }
      }
    });
    writeMessage(child, { method: "initialized" });
    writeMessage(child, { id: 2, method: "account/rateLimits/read", params: null });

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

function writeMessage(child, message) {
  child.stdin.write(`${JSON.stringify(message)}\n`);
}

export function buildSnapshots(result) {
  const limitsById = result?.rateLimitsByLimitId;
  const entries =
    limitsById && typeof limitsById === "object"
      ? Object.entries(limitsById)
      : [["codex", result?.rateLimits]];

  return entries
    .map(([id, limit]) => buildSnapshot(id, limit))
    .filter(Boolean);
}

function buildSnapshot(fallbackId, limit) {
  if (!limit || typeof limit !== "object") return null;

  const serviceId = String(limit.limitId || fallbackId || "codex");
  const windows = [
    normalizeWindow(limit.primary, "primary"),
    normalizeWindow(limit.secondary, "secondary")
  ].filter(Boolean);

  if (windows.length === 0) return null;

  return {
    serviceId,
    serviceName: serviceNameFor(serviceId, limit.limitName),
    planLabel: stringOrNull(limit.planType),
    source: "codex-app-server",
    fetchedAt: new Date().toISOString(),
    windows,
    metadata: {
      bridge: "codex-quota-bridge",
      limitId: stringOrNull(limit.limitId),
      limitName: stringOrNull(limit.limitName),
      planType: stringOrNull(limit.planType),
      rateLimitReachedType: stringOrNull(limit.rateLimitReachedType),
      credits: limit.credits || null
    }
  };
}

function normalizeWindow(window, fallbackId) {
  if (!window || typeof window !== "object") return null;

  const usedPercent = toFiniteNumber(window.usedPercent);
  const durationMins = toFiniteNumber(window.windowDurationMins);
  const id = windowIdFor(durationMins, fallbackId);

  return {
    id,
    label: labelForWindow(id, durationMins, fallbackId),
    usedPercent,
    remainingPercent: Number.isFinite(usedPercent) ? 100 - usedPercent : null,
    resetsAt: timestampToISO(window.resetsAt),
    usedText: Number.isFinite(usedPercent) ? `${Math.round(usedPercent)}% 已用` : null,
    remainingText: Number.isFinite(usedPercent) ? `${Math.round(100 - usedPercent)}% 剩余` : null
  };
}

function serviceNameFor(serviceId, limitName) {
  if (serviceId === "codex") return "Codex";
  if (limitName) return `Codex · ${limitName}`;
  return `Codex · ${serviceId}`;
}

function windowIdFor(durationMins, fallbackId) {
  if (durationMins === 300) return "5h";
  if (durationMins === 10080) return "weekly";
  return fallbackId;
}

function labelForWindow(id, durationMins, fallbackId) {
  if (id === "5h") return "5 小时";
  if (id === "weekly") return "每周";
  if (Number.isFinite(durationMins)) {
    if (durationMins % 1440 === 0) return `${durationMins / 1440} 天`;
    if (durationMins % 60 === 0) return `${durationMins / 60} 小时`;
    return `${durationMins} 分钟`;
  }
  return fallbackId === "primary" ? "短窗口" : "长窗口";
}

async function postSnapshots(url, authToken, snapshots) {
  const headers = { "content-type": "application/json" };
  if (authToken) headers.authorization = `Bearer ${authToken}`;
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(snapshots)
  });
  if (!response.ok) {
    throw new Error(`quota ingest failed: HTTP ${response.status}`);
  }
}

function formatStatusLine(snapshots) {
  const primary = snapshots.find((snapshot) => snapshot.serviceId === "codex") || snapshots[0];
  if (!primary) return "Codex 额度待同步";
  const window = primary.windows.find((item) => item.id === "5h") || primary.windows[0];
  const remaining = Number.isFinite(window?.remainingPercent)
    ? `${Math.round(window.remainingPercent)}%`
    : "--";
  return `${primary.serviceName} ${window?.label || "额度"} ${remaining}`;
}

function timestampToISO(value) {
  const parsed = toFiniteNumber(value);
  if (!Number.isFinite(parsed)) return null;
  const millis = parsed > 1_000_000_000_000 ? parsed : parsed * 1000;
  const date = new Date(millis);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toFiniteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseJSONLine(line) {
  const trimmed = line.trim();
  if (!trimmed || !trimmed.startsWith("{")) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function getArgValue(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}

function stringOrNull(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function isMainModule() {
  if (!process.argv[1]) return false;
  return fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
}
