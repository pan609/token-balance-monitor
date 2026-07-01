const {
  app,
  BrowserWindow,
  globalShortcut,
  Menu,
  Tray,
  ipcMain,
  nativeImage,
  shell,
  screen
} = require("electron");
const fs = require("node:fs");
const fsPromises = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const envPath = path.join(root, ".env");
const settingsPath = path.join(root, ".pet-settings.json");
let mainWindow = null;
let tray = null;
let trayDisplayMode = "total";
let refreshTimer = null;
let refreshInFlight = null;
let lastTraySummary = {
  title: "",
  detail: "等待同步",
  primaryProvider: "aliyun",
  titles: {
    total: ""
  },
  providerLabels: {},
  quotaLabels: {}
};
const expandedSize = { width: 380, height: 574 };
const expandedUsageSize = { width: 380, height: 642 };
const collapsedSize = { width: 260, height: 104 };

app.setName("AI Meter");

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    showWindow();
  });
}

app.whenReady().then(() => {
  loadEnv();
  loadSettings();
  createWindow();
  createTray();
  registerShortcuts();
  startBackgroundRefresh();

  app.on("activate", () => {
    showWindow();
  });
});

app.on("will-quit", () => {
  if (refreshTimer) clearInterval(refreshTimer);
  globalShortcut.unregisterAll();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("balances:get", async () => {
  return fetchBalancesAndUpdateTray();
});

ipcMain.handle("balances:set-primary-provider", async (_event, providerId) => {
  return setPrimaryProvider(providerId);
});

ipcMain.handle("window:collapse", (_event, collapsed) => {
  if (!mainWindow) return;
  const target = collapsed ? collapsedSize : expandedUsageSize;
  mainWindow.setSize(target.width, target.height, true);
});

ipcMain.handle("window:pin", (_event, pinned) => {
  if (!mainWindow) return pinned;
  mainWindow.setAlwaysOnTop(Boolean(pinned), "floating");
  mainWindow.setVisibleOnAllWorkspaces(Boolean(pinned), { visibleOnFullScreen: true });
  return Boolean(pinned);
});

ipcMain.handle("window:open-dashboard", async () => {
  await shell.openExternal(getDashboardUrl({ usage: true }));
});

ipcMain.handle("window:hide", () => {
  mainWindow?.hide();
  updateTrayMenu();
});

ipcMain.handle("window:quit", () => {
  app.quit();
});

ipcMain.on("balances:summary", (_event, summary) => {
  lastTraySummary = {
    title: summary?.title || "",
    detail: summary?.detail || "AI Meter",
    primaryProvider: summary?.primaryProvider || lastTraySummary.primaryProvider || "aliyun",
    titles: {
      total: summary?.title || "",
      ...(summary?.titles || {})
    },
    providerLabels: summary?.providerLabels || lastTraySummary.providerLabels || {},
    quotaLabels: summary?.quotaLabels || lastTraySummary.quotaLabels || {}
  };
  updateTrayMenu();
});

function createWindow() {
  const { workArea } = screen.getPrimaryDisplay();
  mainWindow = new BrowserWindow({
    width: expandedSize.width,
    height: expandedUsageSize.height,
    x: Math.max(workArea.x + workArea.width - expandedSize.width - 28, workArea.x),
    y: Math.max(workArea.y + workArea.height - expandedUsageSize.height - 42, workArea.y),
    frame: false,
    transparent: true,
    resizable: false,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: false,
    title: "AI Meter",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  mainWindow.loadFile(path.join(root, "pet/index.html"));
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  if (process.env.PET_CAPTURE_PATH) {
    mainWindow.webContents.once("did-finish-load", () => {
      setTimeout(async () => {
        const image = await mainWindow.capturePage();
        await fsPromises.mkdir(path.dirname(process.env.PET_CAPTURE_PATH), {
          recursive: true
        });
        await fsPromises.writeFile(process.env.PET_CAPTURE_PATH, image.toPNG());
        app.quit();
      }, 1800);
    });
  }
}

function createTray() {
  tray = new Tray(createTrayIcon());
  tray.setToolTip("AI Meter");
  tray.on("click", () => toggleWindow());
  updateTrayMenu();
}

function createTrayIcon() {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18">
      <rect x="2.5" y="3.5" width="13" height="11" rx="3" fill="#000"/>
      <circle cx="7" cy="8.2" r="1.3" fill="#fff"/>
      <circle cx="11" cy="8.2" r="1.3" fill="#fff"/>
      <rect x="7" y="11.5" width="4" height="1" rx=".5" fill="#fff"/>
    </svg>
  `;
  const icon = nativeImage.createFromDataURL(
    `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  );
  icon.setTemplateImage(true);
  return icon;
}

function updateTrayMenu() {
  if (!tray) return;

  tray.setTitle(getTrayTitle());
  tray.setToolTip(`AI Meter\n${lastTraySummary.detail}`);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: lastTraySummary.detail,
        enabled: false
      },
      { type: "separator" },
      {
        label: "状态栏显示",
        submenu: [
          createDisplayModeItem("total", "总余额"),
          createDisplayModeItem("primary", "重点关注"),
          createDisplayModeItem("usage24h", "近24h消耗"),
          ...getTrayProviderItems(),
          ...getTrayQuotaItems()
        ]
      },
      {
        label: "重点关注平台",
        submenu: getPrimaryProviderItems()
      },
      { type: "separator" },
      {
        label: mainWindow?.isVisible() ? "隐藏桌宠" : "显示桌宠",
        accelerator: "CommandOrControl+Shift+B",
        click: () => toggleWindow()
      },
      {
        label: "立即刷新",
        click: () => {
          fetchBalancesAndUpdateTray({ notifyRenderer: true }).catch(() => {});
        }
      },
      {
        label: "打开网页看板",
        click: () => shell.openExternal(getDashboardUrl({ usage: true }))
      },
      { type: "separator" },
      {
        label: "退出",
        click: () => app.quit()
      }
    ])
  );
}

function createDisplayModeItem(mode, label) {
  const value = lastTraySummary.titles?.[mode] || "--";
  return {
    type: "radio",
    label: `${label} ${value}`,
    checked: trayDisplayMode === mode,
    click: () => {
      trayDisplayMode = mode;
      saveSettings();
      updateTrayMenu();
    }
  };
}

function getTrayTitle() {
  return lastTraySummary.titles?.[trayDisplayMode] || lastTraySummary.title || "";
}

function registerShortcuts() {
  globalShortcut.register("CommandOrControl+Shift+B", () => {
    toggleWindow();
  });
}

function startBackgroundRefresh() {
  fetchBalancesAndUpdateTray({ notifyRenderer: true }).catch(() => {});
  refreshTimer = setInterval(() => {
    fetchBalancesAndUpdateTray({ notifyRenderer: true }).catch(() => {});
  }, 60 * 1000);
}

async function fetchBalancesAndUpdateTray({ notifyRenderer = false } = {}) {
  if (refreshInFlight) {
    const data = await refreshInFlight;
    if (notifyRenderer) mainWindow?.webContents.send("balances:data", data);
    return data;
  }

  refreshInFlight = fetchBalances();
  try {
    const data = await refreshInFlight;
    lastTraySummary = buildTraySummary(data);
    updateTrayMenu();
    if (notifyRenderer) mainWindow?.webContents.send("balances:data", data);
    return data;
  } catch (error) {
    lastTraySummary = {
      title: "",
      detail: "同步失败",
      primaryProvider: lastTraySummary.primaryProvider || "aliyun",
      titles: {
        total: ""
      },
      providerLabels: {},
      quotaLabels: {}
    };
    updateTrayMenu();
    if (notifyRenderer) {
      mainWindow?.webContents.send("balances:error", error.message || "同步失败");
    }
    throw error;
  } finally {
    refreshInFlight = null;
  }
}

async function fetchBalances() {
  loadEnv();
  const [providerModule, historyModule, usageEventModule, quotaModule, quotaRefreshModule] = await Promise.all([
    import(pathToFileURL(path.join(root, "server/providers/index.mjs")).href),
    import(pathToFileURL(path.join(root, "server/history.mjs")).href),
    import(pathToFileURL(path.join(root, "server/usage-events.mjs")).href),
    import(pathToFileURL(path.join(root, "server/quota.mjs")).href),
    import(pathToFileURL(path.join(root, "server/quota-refresh.mjs")).href)
  ]);
  historyModule.initHistoryStore(root);
  usageEventModule.initUsageEventStore(root);

  const balances = await providerModule.fetchAllBalances();
  historyModule.recordBalanceSnapshot(balances, { source: "pet" });
  const localUsageData = {
    usage: historyModule.buildHourlyUsage({ hours: 24 }),
    usageStats: usageEventModule.buildUsageStats({ hours: 24, groupBy: "projectId" }),
    recentUsage: usageEventModule.listRecentUsageEvents({ limit: 8 }),
    usageSource: "local"
  };
  const [remoteUsageData, quotaData] = await Promise.all([
    fetchRemoteUsageData(),
    fetchQuotaData({ quotaModule, quotaRefreshModule })
  ]);

  return {
    ...balances,
    ...(remoteUsageData || localUsageData),
    quota: quotaData
  };
}

async function fetchQuotaData({ quotaModule, quotaRefreshModule }) {
  const localQuotaData = await fetchLocalQuotaData({ quotaModule, quotaRefreshModule });
  if (localQuotaData?.services?.length) return localQuotaData;
  return fetchRemoteQuotaData();
}

async function fetchLocalQuotaData({ quotaModule, quotaRefreshModule }) {
  try {
    quotaModule.initQuotaStore(root);
    try {
      await quotaRefreshModule.refreshQuotaSnapshots({
        force: true,
        serviceId: getPetQuotaRefreshServiceId()
      });
    } catch {
      // Keep showing the latest stored snapshot if live refresh is unavailable.
    }
    return quotaModule.buildQuotaSummary();
  } catch {
    return null;
  }
}

async function fetchRemoteQuotaData() {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl || typeof fetch !== "function") return null;

  const serviceId = getPetQuotaRefreshServiceId();
  try {
    return await fetchJson(`${apiBaseUrl}/api/quota/refresh`, {
      method: "POST",
      headers: buildRemoteQuotaHeaders(),
      body: JSON.stringify({
        force: true,
        serviceId
      })
    });
  } catch {
    try {
      return await fetchJson(`${apiBaseUrl}/api/quota/summary`, {
        headers: buildRemoteQuotaHeaders()
      });
    } catch {
      return null;
    }
  }
}

async function fetchRemoteUsageData() {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl || typeof fetch !== "function") return null;

  try {
    const [usage, usageStats, recentUsage] = await Promise.all([
      fetchJson(`${apiBaseUrl}/api/usage/hourly?hours=24`),
      fetchJson(`${apiBaseUrl}/api/usage/stats?hours=24&groupBy=projectId`),
      fetchJson(`${apiBaseUrl}/api/usage/recent?limit=8`)
    ]);

    return {
      usage,
      usageStats,
      recentUsage,
      usageSource: "remote"
    };
  } catch {
    return null;
  }
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(url, {
      method: options.method || "GET",
      signal: controller.signal,
      headers: options.headers || buildRemoteApiHeaders(),
      body: options.body
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function buildRemoteApiHeaders() {
  const headers = {};
  if (process.env.MOBILE_API_TOKEN) {
    headers["x-mobile-token"] = process.env.MOBILE_API_TOKEN;
  }
  return headers;
}

function buildRemoteQuotaHeaders() {
  const headers = {
    "content-type": "application/json"
  };
  const token = process.env.QUOTA_READ_TOKEN || process.env.MOBILE_API_TOKEN;
  if (token) headers["x-quota-token"] = token;
  return headers;
}

function getPetQuotaRefreshServiceId() {
  const serviceId = String(
    process.env.PET_QUOTA_REFRESH_SERVICE_ID ||
      process.env.MAC_QUOTA_REFRESH_SERVICE_ID ||
      "claude"
  ).trim();
  return serviceId === "all" ? "" : serviceId;
}

function getDashboardUrl({ usage = false } = {}) {
  const baseUrl = getApiBaseUrl() || "http://127.0.0.1:5174/";
  return usage ? `${baseUrl.replace(/#.*$/, "")}#usage-dashboard` : baseUrl;
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
    .replace(/\/api\/usage\/(?:hourly|stats|recent|events)$/i, "");

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

async function setPrimaryProvider(providerId) {
  const normalizedProviderId = String(providerId || "").trim();
  const providerModule = await import(
    pathToFileURL(path.join(root, "server/providers/index.mjs")).href
  );
  if (!providerModule.isKnownProviderId(normalizedProviderId)) {
    throw new Error("不认识的平台");
  }

  setEnvValue("PRIMARY_PROVIDER_ID", normalizedProviderId);
  process.env.PRIMARY_PROVIDER_ID = normalizedProviderId;
  trayDisplayMode = "primary";
  saveSettings();
  return fetchBalancesAndUpdateTray({ notifyRenderer: true });
}

function buildTraySummary(data) {
  const providers = data.providers || [];
  const warnings = providers.filter(
    (provider) => provider.severity === "warning" || provider.severity === "danger"
  );
  const okCount = providers.filter((provider) => provider.status === "ok").length;
  const titles = {
    total: formatCurrency(data.totalCny || 0, "CNY")
  };
  const providerLabels = {};
  const quotaLabels = {};
  const primary = providers.find((provider) => provider.id === data.primaryProvider);
  if (primary) {
    titles.primary = `${primary.shortName} ${
      Number.isFinite(primary.amount) ? formatCurrency(primary.amount, primary.currency) : "--"
    }`;
  }
  const usageTotal = sumHourlyUsage(data.usage);
  titles.usage24h = usageTotal > 0 ? `消耗 ${formatCurrency(usageTotal, "CNY")}` : "消耗 采样中";

  for (const provider of providers) {
    providerLabels[provider.id] = provider.shortName;
    titles[provider.id] = `${provider.shortName} ${
      Number.isFinite(provider.amount) ? formatCurrency(provider.amount, provider.currency) : "--"
    }`;
  }
  for (const entry of collectQuotaTrayEntries(data.quota)) {
    titles[entry.mode] = entry.title;
    quotaLabels[entry.mode] = entry.label;
  }

  const quotaDetail = collectQuotaTrayEntries(data.quota)
    .map((entry) => entry.detail)
    .filter(Boolean)
    .join(" · ");
  const balanceDetail = warnings.length ? `${warnings.length} 项偏低` : `${okCount}/${providers.length} 正常`;

  return {
    title: titles.total,
    detail: [balanceDetail, quotaDetail].filter(Boolean).join(" · "),
    primaryProvider: data.primaryProvider || "aliyun",
    titles,
    providerLabels,
    quotaLabels
  };
}

function collectQuotaTrayEntries(quota) {
  return (quota?.services || [])
    .map((service) => {
      const window = chooseQuotaWindow(service);
      if (!window) return null;

      const serviceName = service.serviceName || service.serviceId || "Quota";
      const windowValue = formatQuotaWindowValue(window);
      const label = serviceName;
      const title = `${serviceName} ${windowValue}`;
      const detailLabel = `${serviceName} ${window.label || "额度"}`;

      return {
        mode: `quota:${service.serviceId}`,
        label,
        title,
        detail: [detailLabel, window.remainingText || windowValue, window.limitText].filter(Boolean).join(" / ")
      };
    })
    .filter(Boolean);
}

function chooseQuotaWindow(service) {
  const windows = service?.windows || [];
  if (!windows.length) return null;
  return windows.find((window) => window.id === "monthly") || windows.find((window) => window.id === "5h") || windows[0];
}

function formatQuotaWindowValue(window) {
  const remainingText = String(window?.remainingText || "").trim();
  if (remainingText) return remainingText.replace(/\s*(剩余|可用)\s*$/u, "");
  if (Number.isFinite(window?.remainingPercent)) return `${Math.round(window.remainingPercent)}%`;
  return "--";
}

function sumHourlyUsage(usage) {
  return (usage?.buckets || []).reduce((sum, bucket) => sum + (bucket.amountCny || 0), 0);
}

function getTrayProviderItems() {
  return Object.entries(lastTraySummary.providerLabels || {}).map(([mode, label]) =>
    createDisplayModeItem(mode, label)
  );
}

function getTrayQuotaItems() {
  const entries = Object.entries(lastTraySummary.quotaLabels || {});
  if (!entries.length) return [];
  return [
    { type: "separator" },
    ...entries.map(([mode, label]) => createDisplayModeItem(mode, label))
  ];
}

function getPrimaryProviderItems() {
  const entries = Object.entries(lastTraySummary.providerLabels || {});
  if (!entries.length) {
    return [{ label: "等待刷新", enabled: false }];
  }

  return entries.map(([providerId, label]) => ({
    type: "radio",
    label,
    checked: lastTraySummary.primaryProvider === providerId,
    click: () => {
      setPrimaryProvider(providerId).catch((error) => {
        lastTraySummary = {
          ...lastTraySummary,
          detail: error.message || "设置失败"
        };
        updateTrayMenu();
      });
    }
  }));
}

function formatCurrency(amount, currency = "CNY") {
  const normalized = String(currency || "CNY").toUpperCase();
  try {
    return new Intl.NumberFormat("zh-CN", {
      style: "currency",
      currency: normalized,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  } catch {
    return `${Number(amount).toFixed(2)} ${normalized}`.trim();
  }
}

function loadSettings() {
  if (!fs.existsSync(settingsPath)) return;

  try {
    const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    if (typeof settings.trayDisplayMode === "string") {
      trayDisplayMode = settings.trayDisplayMode;
    }
  } catch {
    trayDisplayMode = "total";
  }
}

function saveSettings() {
  fs.writeFileSync(
    settingsPath,
    JSON.stringify(
      {
        trayDisplayMode
      },
      null,
      2
    )
  );
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

function toggleWindow() {
  if (!mainWindow) {
    createWindow();
    return;
  }

  if (mainWindow.isVisible()) {
    mainWindow.hide();
  } else {
    showWindow();
  }
  updateTrayMenu();
}

function showWindow() {
  if (!mainWindow) createWindow();
  mainWindow.show();
  mainWindow.focus();
  updateTrayMenu();
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
