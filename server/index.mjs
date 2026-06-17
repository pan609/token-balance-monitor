import express from "express";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildHourlyUsage,
  initHistoryStore,
  recordBalanceSnapshot
} from "./history.mjs";
import { fetchAllBalances, isKnownProviderId } from "./providers/index.mjs";
import {
  buildUsageBreakdown,
  buildUsageOverview,
  buildUsageStats,
  buildUsageTimeline,
  initUsageEventStore,
  listUsageEvents,
  listRecentUsageEvents,
  recordUsageEvents
} from "./usage-events.mjs";
import {
  buildDemoHourlyUsage,
  buildDemoRecentUsage,
  buildDemoUsageBreakdown,
  buildDemoUsageEvents,
  buildDemoUsageOverview,
  buildDemoUsageStats,
  buildDemoUsageTimeline,
  isDemoMode
} from "./demo-data.mjs";
import {
  buildQuotaSummary,
  initQuotaStore,
  recordQuotaSnapshot
} from "./quota.mjs";
import { refreshQuotaSnapshots } from "./quota-refresh.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const envPath = path.join(root, ".env");
loadEnv(envPath);
initHistoryStore(root);
initUsageEventStore(root);
initQuotaStore(root);

const requestedPort = Number(process.env.PORT || 5173);
const host = process.env.HOST || "127.0.0.1";
const port = await findAvailablePort(requestedPort);
const hmrPort = await findAvailablePort(Number(process.env.HMR_PORT || port + 10000));

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(applyUsageCors);

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    now: new Date().toISOString()
  });
});

app.get("/api/balances", async (_req, res) => {
  const startedAt = Date.now();
  const result = await fetchAndRecordBalances("web");
  res.json({
    ...result,
    durationMs: Date.now() - startedAt
  });
});

app.get("/api/usage/hourly", (req, res) => {
  if (isDemoMode()) {
    res.json(buildDemoHourlyUsage());
    return;
  }

  res.json(
    buildHourlyUsage({
      hours: req.query.hours
    })
  );
});

app.post("/api/usage/events", (req, res) => {
  if (!isUsageIngestAuthorized(req)) {
    res.status(401).json({
      ok: false,
      message: "Missing or invalid usage ingest token"
    });
    return;
  }

  const result = recordUsageEvents(req.body, {
    ingestTokenId: getUsageIngestTokenId(req)
  });
  res.status(result.accepted ? 202 : 400).json({
    ok: result.accepted > 0,
    ...result
  });
});

app.options("/api/usage/events", (_req, res) => {
  res.status(204).end();
});

app.get("/api/usage/recent", (req, res) => {
  if (isDemoMode()) {
    res.json(buildDemoRecentUsage({ limit: Number(req.query.limit) || 20 }));
    return;
  }

  res.json(
    listRecentUsageEvents({
      limit: req.query.limit
    })
  );
});

app.get("/api/usage/events", (req, res) => {
  if (isDemoMode()) {
    res.json(
      buildDemoUsageEvents({
        limit: Number(req.query.limit) || 50,
        offset: Number(req.query.offset) || 0
      })
    );
    return;
  }

  res.json(listUsageEvents(req.query));
});

app.get("/api/usage/overview", (req, res) => {
  if (isDemoMode()) {
    res.json(buildDemoUsageOverview());
    return;
  }

  res.json(buildUsageOverview(req.query));
});

app.get("/api/usage/timeline", (req, res) => {
  if (isDemoMode()) {
    res.json(buildDemoUsageTimeline());
    return;
  }

  res.json(buildUsageTimeline(req.query));
});

app.get("/api/usage/stats", (req, res) => {
  if (isDemoMode()) {
    res.json(
      buildDemoUsageStats({
        groupBy: req.query.groupBy || "projectId"
      })
    );
    return;
  }

  res.json(
    buildUsageStats({
      hours: req.query.hours,
      groupBy: req.query.groupBy
    })
  );
});

app.get("/api/usage/breakdown", (req, res) => {
  if (isDemoMode()) {
    res.json(
      buildDemoUsageBreakdown({
        groupBy: req.query.groupBy || "projectId"
      })
    );
    return;
  }

  res.json(buildUsageBreakdown(req.query));
});

app.get("/api/mobile/summary", async (req, res) => {
  if (!isMobileRequestAuthorized(req)) {
    res.status(401).json({
      ok: false,
      message: "Missing or invalid mobile token"
    });
    return;
  }

  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");
  const result = await fetchAndRecordBalances("mobile");
  res.json(buildMobileSummary(result));
});

app.get("/api/quota/summary", (req, res) => {
  if (!isQuotaReadAuthorized(req)) {
    res.status(401).json({
      ok: false,
      message: "Missing or invalid quota read token"
    });
    return;
  }

  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.json(buildQuotaSummary());
});

app.post("/api/quota/refresh", async (req, res) => {
  if (!isQuotaReadAuthorized(req)) {
    res.status(401).json({
      ok: false,
      message: "Missing or invalid quota read token"
    });
    return;
  }

  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");

  let liveRefresh = null;
  try {
    liveRefresh = await refreshQuotaSnapshots({
      force: parseBoolean(req.body?.force ?? req.query.force),
      serviceId: req.body?.serviceId || req.query.serviceId || ""
    });
  } catch (error) {
    liveRefresh = {
      ok: false,
      skipped: false,
      message: error.message || "Live quota refresh failed"
    };
  }

  res.json({
    ...buildQuotaSummary(),
    liveRefresh
  });
});

app.options("/api/quota/refresh", (_req, res) => {
  res.status(204).end();
});

app.post("/api/quota/snapshots", (req, res) => {
  if (!isQuotaIngestAuthorized(req)) {
    res.status(401).json({
      ok: false,
      message: "Missing or invalid quota ingest token"
    });
    return;
  }

  const result = recordQuotaSnapshot(req.body, {
    ingestTokenId: getQuotaIngestTokenId(req)
  });
  res.status(result.accepted ? 202 : 400).json({
    ok: result.accepted > 0,
    ...result
  });
});

app.options("/api/quota/snapshots", (_req, res) => {
  res.status(204).end();
});

app.put("/api/mobile/primary-provider", async (req, res) => {
  if (!isMobileRequestAuthorized(req)) {
    res.status(401).json({
      ok: false,
      message: "Missing or invalid mobile token"
    });
    return;
  }

  const providerId = String(req.body?.providerId || "").trim();
  if (!isKnownProviderId(providerId)) {
    res.status(400).json({
      ok: false,
      message: "Unknown provider id"
    });
    return;
  }

  try {
    setEnvValue(envPath, "PRIMARY_PROVIDER_ID", providerId);
    process.env.PRIMARY_PROVIDER_ID = providerId;
    const result = await fetchAndRecordBalances("mobile-settings");
    res.json(buildMobileSummary(result));
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: error.message || "Failed to update primary provider"
    });
  }
});

function buildMobileSummary(result) {
  const alertThresholdCny = Number(process.env.MOBILE_ALERT_THRESHOLD_CNY || 2);
  const primaryProviderId = result.primaryProvider || "aliyun";
  const usage24h = isDemoMode() ? buildDemoHourlyUsage() : buildHourlyUsage({ hours: 24 });
  const usage24hCny = usage24h.buckets.reduce(
    (sum, bucket) => sum + (bucket.amountCny || 0),
    0
  );
  const providers = Object.fromEntries(
    result.providers.map((provider) => [
      provider.id,
      {
        id: provider.id,
        name: provider.name,
        shortName: provider.shortName,
        amount: provider.amount,
        currency: provider.currency || "CNY",
        status: provider.status,
        statusLabel: provider.statusLabel,
        severity: provider.severity,
        message: provider.message,
        isBelowMobileAlert: isBelowMobileThreshold(
          provider,
          primaryProviderId,
          alertThresholdCny
        )
      }
    ])
  );
  const primary = providers[primaryProviderId] || providers.aliyun;

  return {
    ok: true,
    refreshedAt: result.refreshedAt,
    totalCny: roundMoney(result.totalCny),
    alertThresholdCny,
    primaryProvider: primary?.id || "aliyun",
    primaryAmount: roundMoney(primary?.amount),
    primaryCurrency: primary?.currency || "CNY",
    primaryIsBelowAlert: Boolean(primary?.isBelowMobileAlert),
    usage24hCny:
      usage24h.snapshotCount >= 2 && (usage24h.coverageMinutes >= 60 || usage24hCny > 0)
        ? roundMoney(usage24hCny)
        : null,
    usageSnapshotCount: usage24h.snapshotCount,
    usageCoverageMinutes: usage24h.coverageMinutes,
    providers
  };
}

function isBelowMobileThreshold(provider, primaryProviderId, alertThresholdCny) {
  if (provider.id !== primaryProviderId) return false;
  const comparableAmount = Number.isFinite(provider.amountCny)
    ? provider.amountCny
    : provider.amount;
  const isCnyComparable =
    Number.isFinite(provider.amountCny) ||
    String(provider.currency || "CNY").toUpperCase() === "CNY";
  return isCnyComparable && Number.isFinite(comparableAmount) && comparableAmount < alertThresholdCny;
}

if (process.env.NODE_ENV === "production") {
  const distPath = path.join(root, "dist");
  app.use(express.static(distPath));
  app.use((_req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
} else {
  const { createServer: createViteServer } = await import("vite");
  const vite = await createViteServer({
    root,
    server: {
      middlewareMode: true,
      hmr: { port: hmrPort }
    },
    appType: "spa"
  });
  app.use(vite.middlewares);
}

app.listen(port, host, () => {
  if (port !== requestedPort) {
    console.log(`端口 ${requestedPort} 已占用，已切换到 ${port}`);
  }
  console.log(`Token 余额监控已启动: http://${host}:${port}`);
  startBackgroundBalanceRecorder();
});

async function fetchAndRecordBalances(source) {
  const result = await fetchAllBalances();
  recordBalanceSnapshot(result, { source });
  return result;
}

function startBackgroundBalanceRecorder() {
  if (String(process.env.BALANCE_POLL_ENABLED || "true").toLowerCase() === "false") {
    return;
  }

  const intervalMs = Math.max(
    60 * 1000,
    Number(process.env.BALANCE_POLL_INTERVAL_MS || 60 * 1000)
  );
  let isPolling = false;

  const poll = async () => {
    if (isPolling) return;
    isPolling = true;
    try {
      await fetchAndRecordBalances("poll");
    } catch (error) {
      console.warn(`余额历史轮询失败: ${error.message || error}`);
    } finally {
      isPolling = false;
    }
  };

  setTimeout(poll, 5 * 1000);
  setInterval(poll, intervalMs);
}

async function findAvailablePort(startPort) {
  for (let candidate = startPort; candidate < startPort + 50; candidate += 1) {
    const available = await canListen(candidate);
    if (available) return candidate;
  }

  throw new Error(`没有找到可用端口：${startPort}-${startPort + 49}`);
}

function canListen(candidate) {
  return new Promise((resolve) => {
    const tester = net.createServer();
    tester.once("error", () => resolve(false));
    tester.once("listening", () => {
      tester.close(() => resolve(true));
    });
    tester.listen(candidate, host);
  });
}

function isMobileRequestAuthorized(req) {
  const configuredToken = process.env.MOBILE_API_TOKEN;
  if (!configuredToken) return host === "127.0.0.1";

  const requestToken =
    req.get("x-mobile-token") ||
    req.query.token ||
    req.get("authorization")?.replace(/^Bearer\s+/i, "");
  return requestToken === configuredToken;
}

function isUsageIngestAuthorized(req) {
  const configuredToken = process.env.USAGE_INGEST_TOKEN || process.env.TBM_INGEST_TOKEN;
  if (!configuredToken) {
    return process.env.NODE_ENV !== "production" && host === "127.0.0.1";
  }

  const requestToken =
    req.get("x-usage-token") ||
    req.get("x-ingest-token") ||
    req.get("authorization")?.replace(/^Bearer\s+/i, "");
  return requestToken === configuredToken;
}

function isQuotaReadAuthorized(req) {
  const configuredToken = process.env.QUOTA_READ_TOKEN || process.env.MOBILE_API_TOKEN;
  if (!configuredToken) return host === "127.0.0.1";

  const requestToken =
    req.get("x-quota-token") ||
    req.query.token ||
    req.get("authorization")?.replace(/^Bearer\s+/i, "");
  return requestToken === configuredToken;
}

function isQuotaIngestAuthorized(req) {
  const configuredToken = process.env.QUOTA_INGEST_TOKEN || process.env.USAGE_INGEST_TOKEN;
  if (!configuredToken) {
    return process.env.NODE_ENV !== "production" && host === "127.0.0.1";
  }

  const requestToken =
    req.get("x-quota-token") ||
    req.get("x-quota-ingest-token") ||
    req.get("x-usage-token") ||
    req.get("authorization")?.replace(/^Bearer\s+/i, "");
  return requestToken === configuredToken;
}

function getUsageIngestTokenId(req) {
  return req.get("x-token-id") || req.get("x-project-id") || null;
}

function getQuotaIngestTokenId(req) {
  return req.get("x-token-id") || req.get("x-service-id") || null;
}

function applyUsageCors(req, res, next) {
  const configuredOrigin = process.env.USAGE_INGEST_CORS_ORIGIN;
  if (configuredOrigin && ["/api/usage/events", "/api/quota/snapshots", "/api/quota/refresh"].includes(req.path)) {
    res.setHeader("Access-Control-Allow-Origin", configuredOrigin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "content-type, authorization, x-usage-token, x-ingest-token, x-quota-token, x-quota-ingest-token, x-token-id, x-project-id, x-service-id"
    );
  }
  next();
}

function roundMoney(value) {
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100) / 100;
}

function parseBoolean(value) {
  if (typeof value === "boolean") return value;
  if (value === null || value === undefined) return false;
  return ["1", "true", "yes", "force"].includes(String(value).trim().toLowerCase());
}

function setEnvValue(targetEnvPath, key, value) {
  const sanitizedValue = String(value).replace(/\r?\n/g, "").trim();
  const line = `${key}=${sanitizedValue}`;
  const pattern = new RegExp(`^${escapeRegExp(key)}=.*$`, "m");

  if (!fs.existsSync(targetEnvPath)) {
    fs.writeFileSync(targetEnvPath, `${line}\n`, "utf8");
    return;
  }

  const content = fs.readFileSync(targetEnvPath, "utf8");
  const nextContent = pattern.test(content)
    ? content.replace(pattern, line)
    : `${content}${content.endsWith("\n") || content.length === 0 ? "" : "\n"}${line}\n`;
  fs.writeFileSync(targetEnvPath, nextContent, "utf8");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function loadEnv(envPath) {
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) continue;

    const key = trimmed.slice(0, equalsIndex).trim();
    const rawValue = trimmed.slice(equalsIndex + 1).trim();
    if (!key || process.env[key] !== undefined) continue;

    process.env[key] = stripQuotes(rawValue);
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
