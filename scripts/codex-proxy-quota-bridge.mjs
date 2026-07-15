#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_SERVICE_ID = "codex_proxy";
const DEFAULT_SERVICE_NAME = "Codex";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

if (isMainModule()) {
  await main();
}

export async function collectCodexProxyQuotaSnapshots({ timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  loadDotEnv();
  const payload = await fetchProxyBalance({ timeoutMs });
  return [buildSnapshot(payload)];
}

export function isCodexProxyQuotaConfigured() {
  loadDotEnv();
  return Boolean(getConfiguredBalanceURL());
}

async function main() {
  loadDotEnv();
  const args = new Set(process.argv.slice(2));
  const shouldPost = args.has("--post");
  const timeoutMs = Number(getArgValue("--timeout-ms") || process.env.CODEX_PROXY_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);

  try {
    const payload = await fetchProxyBalance({ timeoutMs });
    const snapshot = buildSnapshot(payload);

    if (shouldPost) {
      await postSnapshots(getIngestURL(), getIngestToken(), [snapshot]);
    }

    if (args.has("--raw")) {
      console.log(JSON.stringify(payload, null, 2));
    } else if (args.has("--json") || shouldPost) {
      console.log(JSON.stringify(snapshot, null, 2));
    } else {
      console.log(formatStatusLine(snapshot));
    }
  } catch (error) {
    if (args.has("--json") || args.has("--raw")) {
      console.log(JSON.stringify({ ok: false, message: error.message }, null, 2));
    } else {
      console.log(`Codex 代理额度读取失败：${error.message}`);
    }
    process.exitCode = 1;
  }
}

async function fetchProxyBalance({ timeoutMs }) {
  const url = getConfiguredBalanceURL();
  if (!url) {
    throw new Error("CODEX_PROXY_BALANCE_URL is required");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: String(process.env.CODEX_PROXY_BALANCE_METHOD || "GET").toUpperCase(),
      headers: buildRequestHeaders(),
      body: getRequestBody(),
      signal: controller.signal
    });
    const text = await response.text();
    const payload = parseResponseBody(text);

    if (!response.ok) {
      const message = payload?.message || payload?.error?.message || text.slice(0, 240);
      throw new Error(`HTTP ${response.status}${message ? `: ${message}` : ""}`);
    }

    return payload;
  } finally {
    clearTimeout(timer);
  }
}

function buildSnapshot(payload) {
  const used = firstMoney(payload, envPathList("CODEX_PROXY_USED_JSON_PATH"), [
    "used",
    "usedAmount",
    "used_amount",
    "usedUsd",
    "used_usd",
    "spent",
    "spend",
    "total_used",
    "totalUsed",
    "current_usage_usd",
    "currentUsageUsd",
    "amount_used",
    "usage",
    "data.total_used",
    "data.used",
    "result.total_used",
    "result.used"
  ]);
  const limit = firstMoney(payload, envPathList("CODEX_PROXY_LIMIT_JSON_PATH"), [
    "limit",
    "limitAmount",
    "limit_amount",
    "hard_limit_usd",
    "system_hard_limit_usd",
    "monthly_limit",
    "monthlyLimit",
    "credit_limit",
    "quota",
    "total_granted",
    "totalGranted",
    "max",
    "data.total_granted",
    "data.limit",
    "result.total_granted",
    "result.limit"
  ]);
  const explicitRemaining = firstMoney(payload, envPathList("CODEX_PROXY_REMAINING_JSON_PATH"), [
    "remaining",
    "remainingAmount",
    "remaining_amount",
    "balance",
    "credit",
    "credits",
    "available",
    "total_available",
    "totalAvailable",
    "remain_quota",
    "quota_remaining",
    "data.total_available",
    "data.balance",
    "data.remaining",
    "result.total_available",
    "result.balance",
    "result.remaining"
  ]);

  const normalizedLimit = normalizeAmount(limit);
  let normalizedUsed = normalizeAmount(used);
  let normalizedRemaining = normalizeAmount(explicitRemaining);

  if (!Number.isFinite(normalizedUsed) && Number.isFinite(normalizedLimit) && Number.isFinite(normalizedRemaining)) {
    normalizedUsed = Math.max(0, normalizedLimit - normalizedRemaining);
  }
  if (!Number.isFinite(normalizedRemaining) && Number.isFinite(normalizedLimit) && Number.isFinite(normalizedUsed)) {
    normalizedRemaining = Math.max(0, normalizedLimit - normalizedUsed);
  }

  if (!Number.isFinite(normalizedUsed) && !Number.isFinite(normalizedRemaining)) {
    throw new Error("Cannot find used or remaining balance in proxy response. Set CODEX_PROXY_USED_JSON_PATH or CODEX_PROXY_REMAINING_JSON_PATH.");
  }

  const usedPercent = Number.isFinite(normalizedUsed) && Number.isFinite(normalizedLimit) && normalizedLimit > 0
    ? clamp((normalizedUsed / normalizedLimit) * 100, 0, 100)
    : null;
  const remainingPercent = Number.isFinite(normalizedRemaining) && Number.isFinite(normalizedLimit) && normalizedLimit > 0
    ? clamp((normalizedRemaining / normalizedLimit) * 100, 0, 100)
    : Number.isFinite(usedPercent)
      ? clamp(100 - usedPercent, 0, 100)
      : null;

  return {
    serviceId: String(process.env.CODEX_PROXY_SERVICE_ID || DEFAULT_SERVICE_ID).trim(),
    serviceName: String(process.env.CODEX_PROXY_SERVICE_NAME || DEFAULT_SERVICE_NAME).trim(),
    accountLabel: optionalString(process.env.CODEX_PROXY_ACCOUNT_LABEL || payload?.accountLabel || "Enterprise proxy"),
    planLabel: optionalString(process.env.CODEX_PROXY_PLAN_LABEL || payload?.planLabel || "API key spend"),
    quotaType: "spend_limit",
    source: optionalString(payload?.source) || "codex-proxy-api-key",
    fetchedAt: new Date().toISOString(),
    windows: [
      {
        id: String(process.env.CODEX_PROXY_WINDOW_ID || "monthly").trim(),
        label: String(process.env.CODEX_PROXY_WINDOW_LABEL || "本月").trim(),
        usedPercent,
        remainingPercent,
        resetsAt: optionalString(readPath(payload, process.env.CODEX_PROXY_RESETS_AT_JSON_PATH || "resets_at")),
        usedText: formatAmountText(normalizedUsed, "已用"),
        remainingText: formatAmountText(normalizedRemaining, "剩余"),
        limitText: formatAmountText(normalizedLimit, "上限")
      }
    ],
    metadata: {
      bridge: "codex-proxy-quota-bridge",
      balanceURLHost: safeURLHost(getConfiguredBalanceURL()),
      currency: getCurrency(),
      ...(isPlainObject(payload?.metadata) ? payload.metadata : {})
    }
  };
}

function buildRequestHeaders() {
  const headers = {
    accept: "application/json"
  };

  const apiKey = String(process.env.CODEX_PROXY_API_KEY || "").trim();
  if (apiKey) {
    const headerName = String(process.env.CODEX_PROXY_AUTH_HEADER || "Authorization").trim();
    const defaultPrefix = headerName.toLowerCase() === "authorization" ? "Bearer" : "";
    const prefix = process.env.CODEX_PROXY_AUTH_PREFIX === undefined
      ? defaultPrefix
      : String(process.env.CODEX_PROXY_AUTH_PREFIX).trim();
    headers[headerName] = prefix ? `${prefix} ${apiKey}` : apiKey;
  }

  const extraHeaders = parseJSONEnv("CODEX_PROXY_HEADERS_JSON");
  for (const [key, value] of Object.entries(extraHeaders)) {
    headers[key] = String(value);
  }

  if (getRequestBody()) {
    headers["content-type"] = headers["content-type"] || "application/json";
  }

  return headers;
}

function getRequestBody() {
  const body = process.env.CODEX_PROXY_BALANCE_BODY;
  if (!body) return undefined;
  return body;
}

function parseResponseBody(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`proxy returned non-JSON response: ${error.message}`);
  }
}

function firstMoney(payload, preferredPaths, fallbackPaths) {
  const paths = [...preferredPaths, ...fallbackPaths];
  for (const itemPath of paths) {
    const value = readPath(payload, itemPath);
    const parsed = parseMoney(value);
    if (Number.isFinite(parsed)) return parsed;
  }

  const fallbackKeys = fallbackPaths.map((item) => item.split(".").pop()).filter(Boolean);
  return recursiveMoneySearch(payload, fallbackKeys);
}

function readPath(payload, itemPath) {
  if (!itemPath) return undefined;
  const parts = String(itemPath)
    .split(".")
    .map((part) => part.trim())
    .filter(Boolean);

  let current = payload;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (/^\d+$/.test(part)) {
      current = current[Number(part)];
    } else {
      current = current[part];
    }
  }
  return current;
}

function recursiveMoneySearch(value, keys, depth = 0) {
  if (!value || typeof value !== "object" || depth > 4) return null;

  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      const parsed = parseMoney(value[key]);
      if (Number.isFinite(parsed)) return parsed;
    }
  }

  for (const child of Object.values(value)) {
    const parsed = recursiveMoneySearch(child, keys, depth + 1);
    if (Number.isFinite(parsed)) return parsed;
  }

  return null;
}

function parseMoney(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const normalized = value.replace(/[,￥¥$]/g, "").trim();
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeAmount(value) {
  if (!Number.isFinite(value)) return null;
  const multiplier = Number(process.env.CODEX_PROXY_AMOUNT_MULTIPLIER || 1);
  const divisor = Number(process.env.CODEX_PROXY_AMOUNT_DIVISOR || 1);
  const normalized = value * (Number.isFinite(multiplier) ? multiplier : 1) / (Number.isFinite(divisor) && divisor !== 0 ? divisor : 1);
  return Number.isFinite(normalized) ? normalized : null;
}

function formatAmountText(value, suffix) {
  if (!Number.isFinite(value)) return null;
  return `${currencySymbol()}${formatAmount(value)} ${suffix}`;
}

function formatAmount(value) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: value >= 100 ? 0 : 2,
    maximumFractionDigits: 2
  });
}

function currencySymbol() {
  switch (getCurrency()) {
  case "CNY":
  case "RMB":
    return "¥";
  case "EUR":
    return "€";
  case "GBP":
    return "£";
  case "JPY":
    return "¥";
  default:
    return "$";
  }
}

function getCurrency() {
  return String(process.env.CODEX_PROXY_CURRENCY || "USD").trim().toUpperCase();
}

async function postSnapshots(url, authToken, snapshots) {
  if (!url) throw new Error("QUOTA_INGEST_URL is required when using --post");

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

function formatStatusLine(snapshot) {
  const window = snapshot.windows?.[0];
  const used = cleanAmountText(window?.usedText);
  const limit = cleanAmountText(window?.limitText);
  const remaining = cleanAmountText(window?.remainingText);
  if (used && limit) return `${snapshot.serviceName} ${used}/${limit}`;
  if (remaining) return `${snapshot.serviceName} ${remaining}`;
  return `${snapshot.serviceName} 额度待同步`;
}

function cleanAmountText(value) {
  return String(value || "")
    .trim()
    .replace(/\s*(已用|剩余|可用|上限)\s*$/u, "")
    .trim();
}

function envPathList(name) {
  return String(process.env[name] || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getBalanceURL() {
  return getArgValue("--balance-url") || process.env.CODEX_PROXY_BALANCE_URL || "";
}

function getConfiguredBalanceURL() {
  const url = getBalanceURL();
  if (!url || isPlaceholderValue(url)) return "";
  return url;
}

function getIngestURL() {
  return getArgValue("--ingest-url") || process.env.TOKEN_MONITOR_QUOTA_URL || process.env.QUOTA_INGEST_URL || "";
}

function getIngestToken() {
  return getArgValue("--ingest-token") || process.env.TOKEN_MONITOR_QUOTA_TOKEN || process.env.QUOTA_INGEST_TOKEN || "";
}

function parseJSONEnv(name) {
  const raw = String(process.env[name] || "").trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function safeURLHost(value) {
  try {
    return new URL(value).host;
  } catch {
    return "";
  }
}

function isPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function isPlaceholderValue(value) {
  const text = String(value || "").trim();
  return !text || text.includes("你的") || text.includes("example.com") || text === "replace-with-your-proxy-key";
}

function optionalString(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function loadDotEnv() {
  const envPath = path.join(root, ".env");
  if (!fs.existsSync(envPath)) return;

  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) continue;
    const key = trimmed.slice(0, equalsIndex).trim();
    if (process.env[key] !== undefined) continue;
    process.env[key] = stripQuotes(trimmed.slice(equalsIndex + 1).trim());
  }
}

function stripQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function getArgValue(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}

function isMainModule() {
  if (!process.argv[1]) return false;
  return fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
}
