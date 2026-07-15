#!/usr/bin/env node
import process from "node:process";

const args = new Set(process.argv.slice(2));
const serviceId = getArgValue("--service") || "claude";
const summaryURL =
  process.env.TOKEN_MONITOR_QUOTA_URL ||
  process.env.QUOTA_INGEST_URL ||
  process.env.TOKEN_MONITOR_INGEST_URL ||
  "";
const token =
  process.env.TOKEN_MONITOR_QUOTA_TOKEN ||
  process.env.QUOTA_INGEST_TOKEN ||
  process.env.TOKEN_MONITOR_INGEST_TOKEN ||
  "";

const input = await readStdinJSON();
const snapshot = buildSnapshot(input, serviceId);

if (snapshot && summaryURL) {
  await postSnapshot(summaryURL, token, snapshot);
}

if (args.has("--json")) {
  console.log(JSON.stringify(snapshot || { ok: false, message: "quota unavailable" }));
} else {
  console.log(formatStatusLine(snapshot));
}

function buildSnapshot(input, requestedServiceId) {
  if (input?.serviceId && Array.isArray(input?.windows)) {
    return input;
  }

  const windows = extractQuotaWindows(input);
  if (windows.length === 0) {
    return null;
  }

  return {
    serviceId: requestedServiceId,
    serviceName: requestedServiceId === "codex" ? "Codex" : "Claude",
    accountLabel: findFirstString(input, ["accountLabel", "account", "plan", "subscription"]),
    planLabel: findFirstString(input, ["planLabel", "model", "modelName", "display_name"]),
    quotaType: "rate_window",
    source: requestedServiceId === "claude" ? "claude-statusline" : "codex-status",
    fetchedAt: new Date().toISOString(),
    windows,
    metadata: {
      bridge: "quota-statusline-bridge",
      inputShape: Object.keys(input || {}).sort().slice(0, 20)
    }
  };
}

function extractQuotaWindows(input) {
  const direct = input?.rate_limits || input?.rateLimits || input?.limits || input?.quota || input?.quotas;
  const candidates = direct ? [direct] : [];

  for (const path of [
    ["session", "rate_limits"],
    ["session", "rateLimits"],
    ["status", "rate_limits"],
    ["status", "rateLimits"],
    ["usage", "limits"],
    ["usage", "rate_limits"]
  ]) {
    const value = getPath(input, path);
    if (value) candidates.push(value);
  }

  const windows = [];
  for (const candidate of candidates) {
    windows.push(...normalizeLimitContainer(candidate));
  }

  return dedupeWindows(windows);
}

function normalizeLimitContainer(value) {
  if (Array.isArray(value)) {
    return value.map((item, index) => normalizeWindow(item, `window-${index}`)).filter(Boolean);
  }

  if (isPlainObject(value)) {
    return Object.entries(value)
      .map(([key, item]) => normalizeWindow(isPlainObject(item) ? item : { remainingPercent: item }, key))
      .filter(Boolean);
  }

  return [];
}

function normalizeWindow(value, fallbackId) {
  const windowId = String(
    value?.id ||
      value?.windowId ||
      value?.window ||
      value?.type ||
      value?.name ||
      fallbackId
  );
  const usedPercent = parsePercent(
    value?.usedPercent ??
      value?.used_percentage ??
      value?.usagePercent ??
      value?.usage_percentage ??
      value?.percentUsed
  );
  const remainingPercent = parsePercent(
    value?.remainingPercent ??
      value?.remaining_percentage ??
      value?.percentRemaining ??
      value?.remaining ??
      (Number.isFinite(usedPercent) ? 100 - usedPercent : null)
  );
  const resetAt = value?.resetsAt || value?.resetAt || value?.reset_at || value?.resets_at;

  if (!Number.isFinite(usedPercent) && !Number.isFinite(remainingPercent) && !resetAt) {
    return null;
  }

  return {
    id: normalizeWindowId(windowId),
    label: labelForWindow(windowId),
    usedPercent: Number.isFinite(usedPercent) ? usedPercent : null,
    remainingPercent: Number.isFinite(remainingPercent)
      ? remainingPercent
      : Number.isFinite(usedPercent)
        ? 100 - usedPercent
        : null,
    resetsAt: timestampToISO(resetAt),
    usedText: stringOrNull(value?.usedText || value?.used),
    remainingText: stringOrNull(value?.remainingText || value?.remaining_label),
    limitText: stringOrNull(value?.limitText || value?.limit)
  };
}

function dedupeWindows(windows) {
  const byId = new Map();
  for (const window of windows) {
    if (!byId.has(window.id)) {
      byId.set(window.id, window);
    }
  }
  return Array.from(byId.values());
}

function normalizeWindowId(value) {
  const text = String(value).toLowerCase();
  if (text.includes("5") || text.includes("five") || text.includes("primary") || text.includes("short")) {
    return "5h";
  }
  if (
    text.includes("week") ||
    text.includes("7") ||
    text.includes("seven") ||
    text.includes("secondary") ||
    text.includes("long")
  ) {
    return "weekly";
  }
  return text.replace(/[^a-z0-9_-]/g, "_") || "window";
}

function labelForWindow(value) {
  const id = normalizeWindowId(value);
  if (id === "5h") return "5 小时";
  if (id === "weekly") return "每周";
  return String(value);
}

async function postSnapshot(url, authToken, snapshot) {
  try {
    const headers = { "content-type": "application/json" };
    if (authToken) headers.authorization = `Bearer ${authToken}`;
    await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(snapshot)
    });
  } catch {
    // Statusline commands must never break the caller.
  }
}

function formatStatusLine(snapshot) {
  if (!snapshot) return "额度待同步";
  const first = snapshot.windows[0];
  const remaining = Number.isFinite(first?.remainingPercent)
    ? `${Math.round(first.remainingPercent)}%`
    : "--";
  const label = snapshot.serviceName || snapshot.serviceId || "Quota";
  return `${label} ${first?.label || "额度"} ${remaining}`;
}

async function readStdinJSON() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function getArgValue(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}

function getPath(input, path) {
  let current = input;
  for (const key of path) {
    if (!current || typeof current !== "object") return null;
    current = current[key];
  }
  return current;
}

function findFirstString(input, keys) {
  if (!input || typeof input !== "object") return null;
  for (const key of keys) {
    const value = input[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (isPlainObject(value)) {
      const nested = findFirstString(value, keys);
      if (nested) return nested;
    }
  }
  return null;
}

function parsePercent(value) {
  if (typeof value === "string") {
    const parsed = Number(value.trim().replace("%", ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function timestampToISO(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (Number.isFinite(parsed)) {
    const millis = parsed > 1_000_000_000_000 ? parsed : parsed * 1000;
    const date = new Date(millis);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function stringOrNull(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function isPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}
