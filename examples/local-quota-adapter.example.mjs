#!/usr/bin/env node
import http from "node:http";

const host = process.env.LOCAL_QUOTA_ADAPTER_HOST || "127.0.0.1";
const port = Number(process.env.LOCAL_QUOTA_ADAPTER_PORT || 17891);

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host || `${host}:${port}`}`);
    if (url.pathname === "/health") {
      sendJSON(response, 200, { ok: true });
      return;
    }
    if (url.pathname === "/balance") {
      sendJSON(response, 200, await buildBalancePayload());
      return;
    }
    sendJSON(response, 404, { ok: false, message: "not found" });
  } catch (error) {
    sendJSON(response, 500, { ok: false, message: error.message || String(error) });
  }
});

server.listen(port, host, () => {
  console.log(`local quota adapter listening on http://${host}:${port}`);
});

async function buildBalancePayload() {
  const upstreamURL = process.env.LOCAL_QUOTA_UPSTREAM_URL;
  if (!upstreamURL) {
    return mockPayload();
  }

  const upstream = await fetchUpstreamJSON(upstreamURL);
  return {
    ok: true,
    source: "local-private-adapter",
    accountLabel: process.env.LOCAL_QUOTA_ACCOUNT_LABEL || "Company proxy",
    planLabel: process.env.LOCAL_QUOTA_PLAN_LABEL || "Monthly spend limit",
    total_used: readNumber(upstream, process.env.LOCAL_QUOTA_USED_PATH || "data.total_used"),
    total_granted: readNumber(upstream, process.env.LOCAL_QUOTA_LIMIT_PATH || "data.total_granted"),
    total_available: readNumber(upstream, process.env.LOCAL_QUOTA_REMAINING_PATH || "data.total_available"),
    metadata: {
      adapter: "local-example"
    }
  };
}

function mockPayload() {
  const used = Number(process.env.LOCAL_QUOTA_MOCK_USED || 35.6);
  const limit = Number(process.env.LOCAL_QUOTA_MOCK_LIMIT || 1000);
  return {
    ok: true,
    source: "local-private-adapter",
    accountLabel: "Example proxy",
    planLabel: "Monthly spend limit",
    total_used: used,
    total_granted: limit,
    total_available: Math.max(0, limit - used),
    metadata: {
      adapter: "local-example",
      mock: true
    }
  };
}

async function fetchUpstreamJSON(url) {
  const headers = { accept: "application/json" };
  const token = process.env.LOCAL_QUOTA_UPSTREAM_TOKEN;
  if (token) {
    const header = process.env.LOCAL_QUOTA_UPSTREAM_AUTH_HEADER || "Authorization";
    const prefix = process.env.LOCAL_QUOTA_UPSTREAM_AUTH_PREFIX ?? "Bearer";
    headers[header] = prefix ? `${prefix} ${token}` : token;
  }

  const response = await fetch(url, { headers });
  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`upstream returned non-JSON response: ${text.slice(0, 120)}`);
  }
  if (!response.ok) {
    throw new Error(`upstream HTTP ${response.status}: ${payload?.message || text.slice(0, 120)}`);
  }
  return payload;
}

function readNumber(payload, dottedPath) {
  const value = String(dottedPath || "")
    .split(".")
    .filter(Boolean)
    .reduce((current, key) => current?.[key], payload);
  const parsed = typeof value === "string" ? Number(value.replace(/[,￥¥$]/g, "")) : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sendJSON(response, status, payload) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(JSON.stringify(payload));
}
