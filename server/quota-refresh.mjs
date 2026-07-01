import { collectCodexQuotaSnapshots } from "../scripts/codex-quota-bridge.mjs";
import { collectClaudeQuotaSnapshots } from "../scripts/claude-quota-bridge.mjs";
import { recordQuotaSnapshot } from "./quota.mjs";

let inFlightRefresh = null;
let lastCompletedAt = 0;

export async function refreshQuotaSnapshots({ force = false, serviceId = "" } = {}) {
  const normalizedServiceId = String(serviceId || "").trim();

  if (normalizedServiceId && !isSupportedService(normalizedServiceId)) {
    return {
      ok: true,
      skipped: true,
      reason: "unsupported-service",
      serviceId: normalizedServiceId
    };
  }

  const minIntervalMs = getMinIntervalMs();
  if (!force && lastCompletedAt && Date.now() - lastCompletedAt < minIntervalMs) {
    return {
      ok: true,
      skipped: true,
      reason: "recently-refreshed",
      refreshedAt: new Date(lastCompletedAt).toISOString()
    };
  }

  if (inFlightRefresh) return inFlightRefresh;

  inFlightRefresh = runQuotaRefresh({ serviceId: normalizedServiceId }).finally(() => {
    inFlightRefresh = null;
  });
  return inFlightRefresh;
}

async function runQuotaRefresh({ serviceId }) {
  const collectors = collectorsFor(serviceId);
  const snapshots = [];
  const errors = [];

  for (const collector of collectors) {
    try {
      snapshots.push(...(await collector.collect({ timeoutMs: getTimeoutMs(collector.serviceId) })));
    } catch (error) {
      errors.push(`${collector.serviceId}: ${error.message || error}`);
    }
  }

  const selected = selectSnapshots(snapshots, serviceId);
  if (selected.length === 0) {
    const suffix = errors.length ? ` (${errors.join("; ")})` : "";
    throw new Error(serviceId ? `No quota snapshot found for ${serviceId}${suffix}` : `No quota snapshot found${suffix}`);
  }

  const result = recordQuotaSnapshot(selected, {
    ingestTokenId: "server-refresh"
  });
  lastCompletedAt = Date.now();

  return {
    ok: result.accepted > 0,
    skipped: false,
    accepted: result.accepted,
    rejected: result.rejected,
    serviceIds: selected.map((snapshot) => snapshot.serviceId),
    errors,
    refreshedAt: new Date(lastCompletedAt).toISOString()
  };
}

function selectSnapshots(snapshots, serviceId) {
  if (!serviceId) return snapshots;
  return snapshots.filter((snapshot) => snapshot.serviceId === serviceId);
}

function collectorsFor(serviceId) {
  if (!serviceId) return [codexCollector(), claudeCollector()];
  if (serviceId.startsWith("codex")) return [codexCollector()];
  if (serviceId.startsWith("claude")) return [claudeCollector()];
  return [];
}

function codexCollector() {
  return {
    serviceId: "codex",
    collect: collectCodexQuotaSnapshots
  };
}

function claudeCollector() {
  return {
    serviceId: "claude",
    collect: collectClaudeQuotaSnapshots
  };
}

function isSupportedService(serviceId) {
  return serviceId.startsWith("codex") || serviceId.startsWith("claude");
}

function getTimeoutMs(serviceId) {
  if (serviceId === "claude") {
    return Math.max(1000, Number(process.env.CLAUDE_QUOTA_TIMEOUT_MS || 30000));
  }
  return Math.max(1000, Number(process.env.CODEX_QUOTA_TIMEOUT_MS || 10000));
}

function getMinIntervalMs() {
  return Math.max(1000, Number(process.env.CODEX_QUOTA_REFRESH_MIN_INTERVAL_MS || 10000));
}
