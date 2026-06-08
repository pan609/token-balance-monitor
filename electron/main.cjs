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
  providerLabels: {}
};
const expandedSize = { width: 380, height: 574 };
const collapsedSize = { width: 260, height: 104 };

app.setName("余额监控桌宠");

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
  const target = collapsed ? collapsedSize : expandedSize;
  mainWindow.setSize(target.width, target.height, true);
});

ipcMain.handle("window:pin", (_event, pinned) => {
  if (!mainWindow) return pinned;
  mainWindow.setAlwaysOnTop(Boolean(pinned), "floating");
  mainWindow.setVisibleOnAllWorkspaces(Boolean(pinned), { visibleOnFullScreen: true });
  return Boolean(pinned);
});

ipcMain.handle("window:open-dashboard", async () => {
  await shell.openExternal("http://127.0.0.1:5174/");
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
    detail: summary?.detail || "余额监控桌宠",
    primaryProvider: summary?.primaryProvider || lastTraySummary.primaryProvider || "aliyun",
    titles: {
      total: summary?.title || "",
      ...(summary?.titles || {})
    },
    providerLabels: summary?.providerLabels || lastTraySummary.providerLabels || {}
  };
  updateTrayMenu();
});

function createWindow() {
  const { workArea } = screen.getPrimaryDisplay();
  mainWindow = new BrowserWindow({
    width: expandedSize.width,
    height: expandedSize.height,
    x: Math.max(workArea.x + workArea.width - expandedSize.width - 28, workArea.x),
    y: Math.max(workArea.y + workArea.height - expandedSize.height - 42, workArea.y),
    frame: false,
    transparent: true,
    resizable: false,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: false,
    title: "余额监控桌宠",
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
  tray.setToolTip("余额监控桌宠");
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
  tray.setToolTip(`余额监控桌宠\n${lastTraySummary.detail}`);
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
          ...getTrayProviderItems()
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
        click: () => shell.openExternal("http://127.0.0.1:5174/")
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
      providerLabels: {}
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
  const providerModule = await import(
    pathToFileURL(path.join(root, "server/providers/index.mjs")).href
  );
  return providerModule.fetchAllBalances();
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
  const primary = providers.find((provider) => provider.id === data.primaryProvider);
  if (primary) {
    titles.primary = `${primary.shortName} ${
      Number.isFinite(primary.amount) ? formatCurrency(primary.amount, primary.currency) : "--"
    }`;
  }

  for (const provider of providers) {
    providerLabels[provider.id] = provider.shortName;
    titles[provider.id] = `${provider.shortName} ${
      Number.isFinite(provider.amount) ? formatCurrency(provider.amount, provider.currency) : "--"
    }`;
  }

  return {
    title: titles.total,
    detail: warnings.length ? `${warnings.length} 项偏低` : `${okCount}/${providers.length} 正常`,
    primaryProvider: data.primaryProvider || "aliyun",
    titles,
    providerLabels
  };
}

function getTrayProviderItems() {
  return Object.entries(lastTraySummary.providerLabels || {}).map(([mode, label]) =>
    createDisplayModeItem(mode, label)
  );
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
