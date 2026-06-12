import fs from "node:fs";
import path from "node:path";

const DEFAULT_RETENTION_DAYS = 30;
const DEFAULT_MIN_WRITE_INTERVAL_MS = 30 * 1000;

let historyDir = null;
let snapshotsPath = null;
let lastWriteAt = 0;

export function initHistoryStore(rootDir) {
  historyDir = process.env.BALANCE_HISTORY_DIR
    ? path.resolve(rootDir, process.env.BALANCE_HISTORY_DIR)
    : path.join(rootDir, "data");
  snapshotsPath = path.join(historyDir, "balance-snapshots.jsonl");
  fs.mkdirSync(historyDir, { recursive: true });
}

export function recordBalanceSnapshot(result, { source = "manual" } = {}) {
  if (!snapshotsPath || isHistoryDisabled()) return false;

  const now = Date.now();
  const minInterval = Number(
    process.env.BALANCE_HISTORY_MIN_WRITE_INTERVAL_MS || DEFAULT_MIN_WRITE_INTERVAL_MS
  );
  if (now - lastWriteAt < minInterval) return false;

  const providers = (result.providers || [])
    .filter((provider) => provider.status === "ok" && Number.isFinite(provider.amount))
    .map((provider) => ({
      id: provider.id,
      name: provider.name,
      shortName: provider.shortName,
      amount: roundNumber(provider.amount),
      amountCny: Number.isFinite(provider.amountCny) ? roundNumber(provider.amountCny) : null,
      currency: String(provider.currency || "CNY").toUpperCase()
    }));

  if (!providers.length) return false;

  const snapshot = {
    at: result.refreshedAt || new Date().toISOString(),
    source,
    totalCny: roundNumber(result.totalCny),
    providers
  };

  fs.appendFileSync(snapshotsPath, `${JSON.stringify(snapshot)}\n`, "utf8");
  lastWriteAt = now;
  compactHistoryIfNeeded();
  return true;
}

export function buildHourlyUsage({ hours = 24 } = {}) {
  const normalizedHours = Math.max(1, Math.min(Number(hours) || 24, 168));
  const until = Date.now();
  const since = until - normalizedHours * 60 * 60 * 1000;
  const snapshots = readSnapshots({ since: since - 2 * 60 * 60 * 1000 });
  const buckets = new Map();
  const providers = new Map();
  let ignoredIncreases = 0;

  for (let index = 1; index < snapshots.length; index += 1) {
    const previous = snapshots[index - 1];
    const current = snapshots[index];
    const currentTime = Date.parse(current.at);
    if (!Number.isFinite(currentTime) || currentTime < since || currentTime > until) continue;

    const bucketKey = toHourKey(currentTime);
    const bucket = ensureBucket(buckets, bucketKey);
    const previousProviders = new Map((previous.providers || []).map((item) => [item.id, item]));

    for (const currentProvider of current.providers || []) {
      const previousProvider = previousProviders.get(currentProvider.id);
      if (!previousProvider) continue;
      if (previousProvider.currency !== currentProvider.currency) continue;

      const nativeDelta = previousProvider.amount - currentProvider.amount;
      const cnyDelta = resolveCnyAmount(previousProvider) - resolveCnyAmount(currentProvider);
      if (nativeDelta <= 0 && cnyDelta <= 0) {
        if (nativeDelta < 0 || cnyDelta < 0) ignoredIncreases += 1;
        continue;
      }

      const provider = ensureProvider(bucket.providers, currentProvider);
      provider.amount += Math.max(0, nativeDelta);
      provider.amountCny += Math.max(0, cnyDelta);
      provider.samples += 1;
      bucket.amountCny += Math.max(0, cnyDelta);
      bucket.samples += 1;
      providers.set(currentProvider.id, {
        id: currentProvider.id,
        name: currentProvider.name,
        shortName: currentProvider.shortName,
        currency: currentProvider.currency
      });
    }
  }

  const orderedBuckets = Array.from(buckets.values())
    .sort((left, right) => left.startedAt.localeCompare(right.startedAt))
    .map((bucket) => ({
      ...bucket,
      amountCny: roundNumber(bucket.amountCny),
      providers: Array.from(bucket.providers.values())
        .sort((left, right) => right.amountCny - left.amountCny)
        .map((provider) => ({
          ...provider,
          amount: roundNumber(provider.amount),
          amountCny: roundNumber(provider.amountCny),
          tokens: null
        }))
    }));

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    hours: normalizedHours,
    snapshotCount: snapshots.length,
    coverageMinutes: calculateCoverageMinutes(snapshots, since, until),
    ignoredIncreases,
    tokenTracking: "not_enabled",
    buckets: orderedBuckets,
    providers: Array.from(providers.values())
  };
}

function readSnapshots({ since = 0 } = {}) {
  if (!snapshotsPath || !fs.existsSync(snapshotsPath)) return [];

  return fs
    .readFileSync(snapshotsPath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter((snapshot) => {
      if (!snapshot?.at || !Array.isArray(snapshot.providers)) return false;
      const at = Date.parse(snapshot.at);
      return Number.isFinite(at) && at >= since;
    })
    .sort((left, right) => Date.parse(left.at) - Date.parse(right.at));
}

function compactHistoryIfNeeded() {
  const retentionDays = Number(process.env.BALANCE_HISTORY_RETENTION_DAYS || DEFAULT_RETENTION_DAYS);
  const retentionMs = Math.max(1, retentionDays) * 24 * 60 * 60 * 1000;
  const cutoff = Date.now() - retentionMs;
  const snapshots = readSnapshots({ since: cutoff });
  const content = snapshots.map((snapshot) => JSON.stringify(snapshot)).join("\n");
  fs.writeFileSync(snapshotsPath, content ? `${content}\n` : "", "utf8");
}

function ensureBucket(buckets, key) {
  if (!buckets.has(key)) {
    buckets.set(key, {
      key,
      startedAt: key,
      label: new Date(key).toLocaleString("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
      }),
      amountCny: 0,
      tokens: null,
      samples: 0,
      providers: new Map()
    });
  }
  return buckets.get(key);
}

function ensureProvider(providers, provider) {
  if (!providers.has(provider.id)) {
    providers.set(provider.id, {
      id: provider.id,
      name: provider.name,
      shortName: provider.shortName,
      currency: provider.currency,
      amount: 0,
      amountCny: 0,
      samples: 0
    });
  }
  return providers.get(provider.id);
}

function resolveCnyAmount(provider) {
  if (Number.isFinite(provider.amountCny)) return provider.amountCny;
  if (String(provider.currency || "CNY").toUpperCase() === "CNY") return provider.amount;
  return 0;
}

function toHourKey(timestamp) {
  const date = new Date(timestamp);
  date.setMinutes(0, 0, 0);
  return date.toISOString();
}

function calculateCoverageMinutes(snapshots, since, until) {
  const inWindow = snapshots
    .map((snapshot) => Date.parse(snapshot.at))
    .filter((timestamp) => Number.isFinite(timestamp) && timestamp >= since && timestamp <= until)
    .sort((left, right) => left - right);
  if (inWindow.length < 2) return 0;
  return Math.max(0, Math.round((inWindow.at(-1) - inWindow[0]) / 60000));
}

function isHistoryDisabled() {
  return String(process.env.BALANCE_HISTORY_ENABLED || "true").toLowerCase() === "false";
}

function roundNumber(value) {
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 10000) / 10000;
}
