const {
  app,
  Menu,
  Tray,
  nativeImage,
  shell
} = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const envPath = path.join(root, ".env");
let tray = null;
let refreshTimer = null;
let refreshInFlight = null;
let lastSummary = null;
let lastError = "";

app.setName("AI Quota");
app.setPath("userData", path.join(app.getPath("appData"), "AI Quota"));

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.whenReady().then(() => {
    app.dock?.hide();
    loadEnv();
    createTray();
    startRefreshLoop();
  });
}

app.on("will-quit", () => {
  if (refreshTimer) clearInterval(refreshTimer);
});

function createTray() {
  tray = new Tray(createTrayIcon());
  tray.setToolTip("AI Quota");
  tray.on("click", () => refreshQuota({ force: true }).catch(() => {}));
  updateTray();
}

function createTrayIcon() {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18">
      <circle cx="9" cy="9" r="7" fill="#000"/>
      <path d="M5.8 10.4c.7 1 1.8 1.6 3.2 1.6s2.5-.6 3.2-1.6" fill="none" stroke="#fff" stroke-width="1.4" stroke-linecap="round"/>
      <circle cx="6.8" cy="7.4" r="1" fill="#fff"/>
      <circle cx="11.2" cy="7.4" r="1" fill="#fff"/>
    </svg>
  `;
  const icon = nativeImage.createFromDataURL(
    `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  );
  icon.setTemplateImage(true);
  return icon;
}

function startRefreshLoop() {
  refreshQuota({ force: true }).catch(() => {});
  refreshTimer = setInterval(() => {
    refreshQuota({ force: true }).catch(() => {});
  }, getRefreshIntervalMs());
}

async function refreshQuota({ force = false } = {}) {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = doRefreshQuota({ force }).finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

async function doRefreshQuota({ force }) {
  loadEnv();
  const [quotaModule, quotaRefreshModule] = await Promise.all([
    import(pathToFileURL(path.join(root, "server/quota.mjs")).href),
    import(pathToFileURL(path.join(root, "server/quota-refresh.mjs")).href)
  ]);
  quotaModule.initQuotaStore(root);

  const serviceIds = getMenuServiceIds();
  const errors = [];
  const refreshTargets = serviceIds.length ? serviceIds : [""];
  for (const serviceId of refreshTargets) {
    try {
      await quotaRefreshModule.refreshQuotaSnapshots({
        force,
        serviceId
      });
    } catch (error) {
      errors.push(`${serviceId || "all"}: ${error.message || error}`);
    }
  }

  lastSummary = quotaModule.buildQuotaSummary();
  lastError = errors.join(" · ");
  updateTray();
  return lastSummary;
}

function updateTray() {
  if (!tray) return;

  const entries = getVisibleQuotaEntries();
  const primary = getPrimaryEntry(entries);
  tray.setTitle(primary?.title || "Quota --");
  tray.setToolTip(["AI Quota", primary?.detail, lastError].filter(Boolean).join("\n"));
  tray.setContextMenu(Menu.buildFromTemplate(buildMenuTemplate(entries, primary)));
}

function buildMenuTemplate(entries, primary) {
  const serviceItems = entries.length
    ? entries.map((entry) => ({
      type: "radio",
      label: `${entry.label} ${entry.value}`,
      checked: primary?.serviceId === entry.serviceId,
      click: () => setPrimaryService(entry.serviceId)
    }))
    : [{ label: "等待额度快照", enabled: false }];

  return [
    {
      label: primary?.detail || lastError || "等待同步",
      enabled: false
    },
    { type: "separator" },
    {
      label: "重点显示",
      submenu: serviceItems
    },
    {
      label: "立即刷新",
      click: () => refreshQuota({ force: true }).catch((error) => {
        lastError = error.message || "刷新失败";
        updateTray();
      })
    },
    {
      label: "打开 Web 看板",
      click: () => shell.openExternal(getDashboardUrl())
    },
    {
      label: "打开 Watch 配置说明",
      click: () => shell.openExternal(pathToFileURL(path.join(root, "docs/subscription-quota-watch.md")).href)
    },
    { type: "separator" },
    {
      label: "退出 AI Quota",
      click: () => app.quit()
    }
  ];
}

function getVisibleQuotaEntries() {
  const allowed = new Set(getMenuServiceIds());
  const services = lastSummary?.services || [];

  if (allowed.size === 0) {
    return services.map(serviceToEntry);
  }

  return [...allowed].map((serviceId) => {
    const service = services.find((item) => item.serviceId === serviceId);
    return service ? serviceToEntry(service) : placeholderEntryForService(serviceId);
  });
}

function getPrimaryEntry(entries) {
  const requested = getPrimaryServiceId();
  return entries.find((entry) => entry.serviceId === requested) || entries[0] || null;
}

function chooseWindow(service) {
  const windows = service?.windows || [];
  if (!windows.length) return null;
  if (service.quotaType === "spend_limit") {
    return windows.find((window) => window.id === "monthly") || windows[0];
  }
  return windows.find((window) => window.id === "5h") || windows[0];
}

function formatWindowValue(window) {
  const remainingText = String(window?.remainingText || "").trim();
  if (remainingText) return remainingText.replace(/\s*(剩余|可用)\s*$/u, "");
  if (Number.isFinite(window?.remainingPercent)) return `${Math.round(window.remainingPercent)}%`;
  return "--";
}

function formatSpendLimitValue(window) {
  const usedText = cleanQuotaAmountText(window?.usedText);
  const limitText = cleanQuotaAmountText(window?.limitText).replace(/\.00$/u, "");
  if (usedText && limitText) return `${usedText}/${limitText}`;
  return formatWindowValue(window);
}

function serviceToEntry(service) {
  const window = chooseWindow(service);
  const isSpendLimit = service.quotaType === "spend_limit";
  const value = isSpendLimit ? formatSpendLimitValue(window) : formatWindowValue(window);
  const serviceName = service.serviceName || displayNameForServiceId(service.serviceId);
  const title = service.quotaType === "rate_window" && window?.label
    ? `${serviceName} ${window.label} ${value}`
    : `${serviceName} ${value}`;
  const stale = service.isStale ? "可能过期" : service.statusLabel;

  return {
    serviceId: service.serviceId,
    label: serviceName,
    value,
    title,
    detail: [
      `${serviceName} ${isSpendLimit ? "订阅花费" : window?.label || "订阅额度"}`,
      isSpendLimit ? value : window?.remainingText || value,
      isSpendLimit ? window?.remainingText : window?.limitText,
      stale
    ].filter(Boolean).join(" / ")
  };
}

function placeholderEntryForService(serviceId) {
  const serviceName = displayNameForServiceId(serviceId);
  return {
    serviceId,
    label: serviceName,
    value: "--",
    title: `${serviceName} --`,
    detail: `${serviceName} 等待同步${lastError ? ` / ${lastError}` : ""}`
  };
}

function displayNameForServiceId(serviceId) {
  const normalized = String(serviceId || "").toLowerCase();
  if (normalized.startsWith("claude")) return "Claude";
  if (normalized.startsWith("codex")) return "Codex";
  return serviceId || "Quota";
}

function cleanQuotaAmountText(value) {
  return String(value || "")
    .trim()
    .replace(/\s*(已用|剩余|可用|上限)\s*$/u, "")
    .trim();
}

function setPrimaryService(serviceId) {
  setEnvValue("PRIMARY_QUOTA_SERVICE_ID", serviceId);
  process.env.PRIMARY_QUOTA_SERVICE_ID = serviceId;
  updateTray();
}

function getPrimaryServiceId() {
  return String(process.env.PRIMARY_QUOTA_SERVICE_ID || getMenuServiceIds()[0] || "claude").trim();
}

function getMenuServiceIds() {
  const raw = String(process.env.QUOTA_MENU_SERVICES || process.env.PRIMARY_QUOTA_SERVICE_ID || "claude").trim();
  if (!raw || raw === "all") return [];
  return raw.split(",").map((item) => item.trim()).filter(Boolean);
}

function getRefreshIntervalMs() {
  return Math.max(15000, Number(process.env.QUOTA_MENU_REFRESH_INTERVAL_MS || 60000));
}

function getDashboardUrl() {
  const baseUrl = getApiBaseUrl() || "http://127.0.0.1:5174/";
  return `${baseUrl.replace(/#.*$/, "")}#overview`;
}

function getApiBaseUrl() {
  const candidates = [
    process.env.TOKEN_MONITOR_API_BASE_URL,
    process.env.PUBLIC_API_BASE_URL,
    process.env.MOBILE_API_BASE_URL,
    process.env.API_BASE_URL,
    process.env.MOBILE_API_URL,
    readIosMobileSummaryUrl()
  ];

  for (const candidate of candidates) {
    const normalized = normalizeApiBaseUrl(candidate);
    if (normalized) return normalized;
  }

  return "";
}

function normalizeApiBaseUrl(value) {
  if (!value) return "";
  let normalized = String(value).trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(normalized)) return "";

  normalized = normalized
    .replace(/\/api\/mobile\/summary$/i, "")
    .replace(/\/api\/balances$/i, "")
    .replace(/\/api\/usage\/(?:hourly|stats|recent|events)$/i, "")
    .replace(/\/api\/quota\/(?:summary|refresh|snapshots)$/i, "");

  return normalized.replace(/\/+$/, "");
}

function readIosMobileSummaryUrl() {
  const configPath = path.join(
    root,
    "ios/TokenBalanceMonitor/Shared/TokenMonitorConfig.swift"
  );
  if (!fs.existsSync(configPath)) return "";

  const match = fs
    .readFileSync(configPath, "utf8")
    .match(/mobileSummaryURL\s*=\s*"([^"]+)"/);
  return match?.[1] || "";
}

function loadEnv() {
  if (!fs.existsSync(envPath)) return;

  const env = parseEnv(fs.readFileSync(envPath, "utf8"));
  for (const [key, value] of Object.entries(env)) {
    process.env[key] = value;
  }
}

function parseEnv(contents) {
  const env = {};
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) continue;

    const key = trimmed.slice(0, equalsIndex).trim();
    const rawValue = trimmed.slice(equalsIndex + 1).trim();
    env[key] = stripQuotes(rawValue);
  }

  return env;
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

function setEnvValue(key, value) {
  const sanitizedValue = String(value).replace(/\r?\n/g, "").trim();
  const line = `${key}=${sanitizedValue}`;
  const pattern = new RegExp(`^${escapeRegExp(key)}=.*$`, "m");

  if (!fs.existsSync(envPath)) {
    fs.writeFileSync(envPath, `${line}\n`, "utf8");
    return;
  }

  const content = fs.readFileSync(envPath, "utf8");
  const nextContent = pattern.test(content)
    ? content.replace(pattern, line)
    : `${content}${content.endsWith("\n") || content.length === 0 ? "" : "\n"}${line}\n`;
  fs.writeFileSync(envPath, nextContent, "utf8");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
