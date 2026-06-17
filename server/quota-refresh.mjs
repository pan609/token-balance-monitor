import { collectCodexQuotaSnapshots } from "../scripts/codex-quota-bridge.mjs";
import { recordQuotaSnapshot } from "./quota.mjs";

let inFlightRefresh = null;
let lastCompletedAt = 0;

export async function refreshQuotaSnapshots({ force = false, serviceId = "" } = {}) {
  const normalizedServiceId = String(serviceId || "").trim();

  if (normalizedServiceId && !normalizedServiceId.startsWith("codex")) {
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

  inFlightRefresh = runCodexRefresh({ serviceId: normalizedServiceId }).finally(() => {
    inFlightRefresh = null;
  });
  return inFlightRefresh;
}

async function runCodexRefresh({ serviceId }) {
  const snapshots = await collectCodexQuotaSnapshots({
    timeoutMs: getTimeoutMs()
  });
  const selected = selectSnapshots(snapshots, serviceId);
  if (selected.length === 0) {
    throw new Error(serviceId ? `No Codex quota snapshot found for ${serviceId}` : "No Codex quota snapshot found");
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
    refreshedAt: new Date(lastCompletedAt).toISOString()
  };
}

function selectSnapshots(snapshots, serviceId) {
  if (!serviceId) return snapshots;
  return snapshots.filter((snapshot) => snapshot.serviceId === serviceId);
}

function getTimeoutMs() {
  return Math.max(1000, Number(process.env.CODEX_QUOTA_TIMEOUT_MS || 10000));
}

function getMinIntervalMs() {
  return Math.max(1000, Number(process.env.CODEX_QUOTA_REFRESH_MIN_INTERVAL_MS || 10000));
}
