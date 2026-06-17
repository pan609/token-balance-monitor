import fs from "node:fs";
import path from "node:path";

const DEFAULT_STALE_SECONDS = 120;
const DEFAULT_WARNING_REMAINING_PERCENT = 20;
const DEFAULT_CRITICAL_REMAINING_PERCENT = 8;

let storePath = null;

export function initQuotaStore(root) {
  const dataDir = process.env.QUOTA_EVENTS_DIR || process.env.USAGE_EVENTS_DIR || "data";
  const resolvedDir = path.isAbsolute(dataDir) ? dataDir : path.join(root, dataDir);
  fs.mkdirSync(resolvedDir, { recursive: true });
  storePath = path.join(resolvedDir, "quota-snapshots.jsonl");
}

export function recordQuotaSnapshot(payload, context = {}) {
  ensureStore();
  const snapshots = Array.isArray(payload) ? payload : [payload];
  const accepted = [];
  const rejected = [];

  for (const item of snapshots) {
    const normalized = normalizeSnapshot(item, context);
    if (normalized.ok) {
      accepted.push(normalized.snapshot);
    } else {
      rejected.push(normalized.reason);
    }
  }

  if (accepted.length > 0) {
    const lines = accepted.map((snapshot) => JSON.stringify(snapshot)).join("\n") + "\n";
    fs.appendFileSync(storePath, lines, "utf8");
  }

  return {
    accepted: accepted.length,
    rejected: rejected.length,
    errors: rejected,
    snapshots: accepted
  };
}

export function buildQuotaSummary() {
  ensureStore();
  const latestByService = new Map();
  for (const snapshot of readSnapshots()) {
    const previous = latestByService.get(snapshot.serviceId);
    if (!previous || Date.parse(snapshot.fetchedAt) > Date.parse(previous.fetchedAt)) {
      latestByService.set(snapshot.serviceId, snapshot);
    }
  }

  const services = Array.from(latestByService.values())
    .map(decorateSnapshot)
    .sort((a, b) => serviceOrder(a.serviceId) - serviceOrder(b.serviceId));
  const primaryServiceId = resolvePrimaryQuotaServiceId(services);
  const primaryService = services.find((service) => service.serviceId === primaryServiceId) || null;

  return {
    ok: true,
    refreshedAt: new Date().toISOString(),
    staleSeconds: getStaleSeconds(),
    warningRemainingPercent: getWarningRemainingPercent(),
    criticalRemainingPercent: getCriticalRemainingPercent(),
    primaryServiceId: primaryService?.serviceId || services[0]?.serviceId || "codex",
    primaryService,
    services
  };
}

function normalizeSnapshot(input, context) {
  const serviceId = String(input?.serviceId || input?.provider || input?.service || "").trim();
  if (!serviceId) {
    return { ok: false, reason: "serviceId is required" };
  }

  const windowsInput = Array.isArray(input?.windows) ? input.windows : [];
  const windows = windowsInput.map(normalizeWindow).filter(Boolean);
  if (windows.length === 0) {
    return { ok: false, reason: `${serviceId}: windows is required` };
  }

  const fetchedAt = parseDate(input?.fetchedAt || input?.updatedAt || input?.createdAt) || new Date();
  return {
    ok: true,
    snapshot: {
      serviceId,
      serviceName: String(input?.serviceName || serviceNameFor(serviceId)),
      accountLabel: optionalString(input?.accountLabel),
      planLabel: optionalString(input?.planLabel),
      source: String(input?.source || "manual"),
      fetchedAt: fetchedAt.toISOString(),
      ingestedAt: new Date().toISOString(),
      ingestTokenId: context.ingestTokenId || null,
      windows,
      message: optionalString(input?.message),
      metadata: isPlainObject(input?.metadata) ? input.metadata : {}
    }
  };
}

function normalizeWindow(input) {
  const windowId = String(input?.id || input?.windowId || input?.window || input?.type || "").trim();
  if (!windowId) return null;

  const usedPercent = parsePercent(
    input?.usedPercent ??
      input?.used_percentage ??
      input?.usagePercent ??
      input?.usage_percentage ??
      input?.percentUsed
  );
  const remainingPercent = parsePercent(
    input?.remainingPercent ??
      input?.remaining_percentage ??
      input?.percentRemaining ??
      (Number.isFinite(usedPercent) ? 100 - usedPercent : null)
  );

  return {
    id: windowId,
    label: String(input?.label || labelForWindow(windowId)),
    usedPercent: Number.isFinite(usedPercent) ? clamp(usedPercent, 0, 100) : null,
    remainingPercent: Number.isFinite(remainingPercent) ? clamp(remainingPercent, 0, 100) : null,
    resetsAt: parseDate(input?.resetsAt || input?.resetAt || input?.reset_at)?.toISOString() || null,
    usedText: optionalString(input?.usedText),
    remainingText: optionalString(input?.remainingText),
    limitText: optionalString(input?.limitText)
  };
}

function decorateSnapshot(snapshot) {
  const ageSeconds = Math.max(0, Math.round((Date.now() - Date.parse(snapshot.fetchedAt)) / 1000));
  const isStale = ageSeconds > getStaleSeconds();
  const lowestRemaining = snapshot.windows.reduce((lowest, window) => {
    if (!Number.isFinite(window.remainingPercent)) return lowest;
    return Math.min(lowest, window.remainingPercent);
  }, Infinity);
  const status = isStale ? "stale" : quotaStatus(lowestRemaining);

  return {
    ...snapshot,
    ageSeconds,
    isStale,
    status,
    statusLabel: statusLabel(status),
    windows: snapshot.windows.map((window) => ({
      ...window,
      status: isStale ? "stale" : quotaStatus(window.remainingPercent),
      statusLabel: isStale ? "可能过期" : statusLabel(quotaStatus(window.remainingPercent))
    }))
  };
}

function quotaStatus(remainingPercent) {
  if (!Number.isFinite(remainingPercent)) return "unknown";
  if (remainingPercent <= getCriticalRemainingPercent()) return "critical";
  if (remainingPercent <= getWarningRemainingPercent()) return "warning";
  return "ok";
}

function statusLabel(status) {
  switch (status) {
  case "ok":
    return "充足";
  case "warning":
    return "偏低";
  case "critical":
    return "紧张";
  case "stale":
    return "可能过期";
  default:
    return "待确认";
  }
}

function readSnapshots() {
  if (!fs.existsSync(storePath)) return [];
  const content = fs.readFileSync(storePath, "utf8");
  const cutoff = Date.now() - getRetentionDays() * 24 * 60 * 60 * 1000;

  return content
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter((snapshot) => snapshot && Date.parse(snapshot.fetchedAt) >= cutoff);
}

function resolvePrimaryQuotaServiceId(services) {
  const requested = String(process.env.PRIMARY_QUOTA_SERVICE_ID || "codex").trim();
  if (services.some((service) => service.serviceId === requested)) return requested;
  return services[0]?.serviceId || "codex";
}

function serviceOrder(serviceId) {
  const order = ["codex", "claude"];
  const index = order.indexOf(serviceId);
  return index === -1 ? order.length : index;
}

function serviceNameFor(serviceId) {
  switch (serviceId) {
  case "codex":
    return "Codex";
  case "claude":
    return "Claude";
  default:
    return serviceId;
  }
}

function labelForWindow(windowId) {
  switch (windowId) {
  case "5h":
  case "five_hour":
  case "rolling_5h":
    return "5 小时";
  case "weekly":
  case "7d":
    return "每周";
  default:
    return windowId;
  }
}

function parsePercent(value) {
  if (typeof value === "string") {
    const normalized = value.trim().replace("%", "");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function optionalString(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function isPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getStaleSeconds() {
  return Math.max(15, Number(process.env.QUOTA_STALE_SECONDS || DEFAULT_STALE_SECONDS));
}

function getWarningRemainingPercent() {
  return clamp(Number(process.env.QUOTA_WARNING_REMAINING_PERCENT || DEFAULT_WARNING_REMAINING_PERCENT), 1, 99);
}

function getCriticalRemainingPercent() {
  return clamp(Number(process.env.QUOTA_CRITICAL_REMAINING_PERCENT || DEFAULT_CRITICAL_REMAINING_PERCENT), 0, 98);
}

function getRetentionDays() {
  return Math.max(1, Number(process.env.QUOTA_RETENTION_DAYS || 14));
}

function ensureStore() {
  if (!storePath) {
    throw new Error("Quota store is not initialized");
  }
}
