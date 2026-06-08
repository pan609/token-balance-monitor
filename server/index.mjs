import express from "express";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchAllBalances, isKnownProviderId } from "./providers/index.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const envPath = path.join(root, ".env");
loadEnv(envPath);

const requestedPort = Number(process.env.PORT || 5173);
const host = process.env.HOST || "127.0.0.1";
const port = await findAvailablePort(requestedPort);
const hmrPort = await findAvailablePort(Number(process.env.HMR_PORT || port + 10000));

const app = express();
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    now: new Date().toISOString()
  });
});

app.get("/api/balances", async (_req, res) => {
  const startedAt = Date.now();
  const result = await fetchAllBalances();
  res.json({
    ...result,
    durationMs: Date.now() - startedAt
  });
});

app.get("/api/mobile/summary", async (req, res) => {
  if (!isMobileRequestAuthorized(req)) {
    res.status(401).json({
      ok: false,
      message: "Missing or invalid mobile token"
    });
    return;
  }

  const result = await fetchAllBalances();
  res.json(buildMobileSummary(result));
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
    const result = await fetchAllBalances();
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
});

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

function roundMoney(value) {
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100) / 100;
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
