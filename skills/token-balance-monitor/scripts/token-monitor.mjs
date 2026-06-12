#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const command = process.argv[2];

try {
  if (command === "balance") {
    await printBalanceSummary();
  } else if (command === "dashboard") {
    printDashboardUrl();
  } else if (command === "report") {
    await reportUsageEvent(process.argv[3]);
  } else {
    printUsage();
    process.exit(command ? 1 : 0);
  }
} catch (error) {
  console.error(error.message || String(error));
  process.exit(1);
}

async function printBalanceSummary() {
  const baseUrl = requiredEnv("TOKEN_MONITOR_BASE_URL");
  const token = requiredEnv("TOKEN_MONITOR_MOBILE_TOKEN");
  const summary = await requestJson(`${baseUrl.replace(/\/$/, "")}/api/mobile/summary`, {
    headers: {
      accept: "application/json",
      authorization: `Bearer ${token}`
    }
  });

  const providers = Object.values(summary.providers || {}).map((provider) => ({
    id: provider.id,
    name: provider.name,
    amount: provider.amount,
    currency: provider.currency,
    status: provider.status,
    severity: provider.severity
  }));

  console.log(
    JSON.stringify(
      {
        ok: summary.ok,
        refreshedAt: summary.refreshedAt,
        totalCny: summary.totalCny,
        primaryProvider: summary.primaryProvider,
        primaryAmount: summary.primaryAmount,
        primaryCurrency: summary.primaryCurrency,
        primaryIsBelowAlert: summary.primaryIsBelowAlert,
        usage24hCny: summary.usage24hCny,
        providers
      },
      null,
      2
    )
  );
}

function printDashboardUrl() {
  const baseUrl = requiredEnv("TOKEN_MONITOR_BASE_URL").replace(/\/$/, "");
  console.log(`${baseUrl}/#usage-dashboard`);
}

async function reportUsageEvent(filePath) {
  if (!filePath) {
    throw new Error("Usage: token-monitor.mjs report <event-json-file>");
  }

  const baseUrl = requiredEnv("TOKEN_MONITOR_BASE_URL");
  const token = requiredEnv("TOKEN_MONITOR_INGEST_TOKEN");
  const absolutePath = path.resolve(filePath);
  const payload = JSON.parse(fs.readFileSync(absolutePath, "utf8"));
  const body = Array.isArray(payload) || payload.events ? payload : { events: [payload] };

  const result = await requestJson(`${baseUrl.replace(/\/$/, "")}/api/usage/events`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`
    },
    body: JSON.stringify(body)
  });

  console.log(JSON.stringify(result, null, 2));
}

async function requestJson(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }

  if (!response.ok) {
    throw new Error(`Token Monitor request failed: HTTP ${response.status}`);
  }

  return data;
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function printUsage() {
  console.log(`Usage:
  token-monitor.mjs balance
  token-monitor.mjs dashboard
  token-monitor.mjs report <event-json-file>

Required env:
  TOKEN_MONITOR_BASE_URL
  TOKEN_MONITOR_MOBILE_TOKEN   for balance
  TOKEN_MONITOR_INGEST_TOKEN   for report
`);
}
