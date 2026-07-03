const compactFormatter = new Intl.NumberFormat("zh-CN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const state = {
  collapsed: false,
  pinned: true,
  loading: false,
  updatingPrimary: false,
  timer: null,
  latestData: null
};

const elements = {
  shell: document.getElementById("petShell"),
  moodText: document.getElementById("moodText"),
  totalBalance: document.getElementById("totalBalance"),
  refreshTime: document.getElementById("refreshTime"),
  focusName: document.getElementById("focusName"),
  focusAmount: document.getElementById("focusAmount"),
  focusSelect: document.getElementById("focusSelect"),
  usageAmount: document.getElementById("usageAmount"),
  usageMeta: document.getElementById("usageMeta"),
  usageTokens: document.getElementById("usageTokens"),
  usageRecent: document.getElementById("usageRecent"),
  quotaSessionRemain: document.getElementById("quotaSessionRemain"),
  quotaSessionReset: document.getElementById("quotaSessionReset"),
  quotaWeeklyRemain: document.getElementById("quotaWeeklyRemain"),
  quotaWeeklyReset: document.getElementById("quotaWeeklyReset"),
  providerList: document.getElementById("providerList"),
  refreshButton: document.getElementById("refreshButton"),
  collapseButton: document.getElementById("collapseButton"),
  pinButton: document.getElementById("pinButton"),
  closeButton: document.getElementById("closeButton"),
  dashboardButton: document.getElementById("dashboardButton")
};

elements.refreshButton.addEventListener("click", () => refreshBalances());
elements.collapseButton.addEventListener("click", toggleCollapse);
elements.pinButton.addEventListener("click", togglePin);
elements.closeButton.addEventListener("click", () => window.balancePet.hide());
elements.dashboardButton.addEventListener("click", () => window.balancePet.openDashboard());
for (const trigger of document.querySelectorAll("[data-dashboard-link]")) {
  trigger.addEventListener("click", () => window.balancePet.openDashboard());
  trigger.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    window.balancePet.openDashboard();
  });
}
elements.focusSelect.addEventListener("change", () => {
  setPrimaryProvider(elements.focusSelect.value);
});
elements.providerList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-primary-provider]");
  if (!button) return;
  setPrimaryProvider(button.dataset.primaryProvider);
});
window.balancePet.onRefreshRequested(() => refreshBalances());
window.balancePet.onBalancesUpdated((data) => renderBalances(data));
window.balancePet.onBalanceError((message) => renderError({ message }));

refreshBalances();

async function refreshBalances() {
  if (state.loading) return;
  state.loading = true;
  setControlsDisabled(true);
  elements.refreshButton.textContent = "同步中";
  elements.shell.classList.add("is-loading");

  try {
    const data = await window.balancePet.getBalances();
    renderBalances(data);
  } catch (error) {
    renderError(error);
  } finally {
    state.loading = false;
    setControlsDisabled(false);
    elements.refreshButton.textContent = "刷新";
    elements.shell.classList.remove("is-loading");
  }
}

async function setPrimaryProvider(providerId) {
  if (state.updatingPrimary || !providerId) return;
  state.updatingPrimary = true;
  setControlsDisabled(true);
  elements.moodText.textContent = "正在切换";
  elements.shell.classList.add("is-loading");

  try {
    const data = await window.balancePet.setPrimaryProvider(providerId);
    renderBalances(data);
  } catch (error) {
    renderError(error);
  } finally {
    state.updatingPrimary = false;
    setControlsDisabled(false);
    elements.shell.classList.remove("is-loading");
  }
}

function renderBalances(data) {
  const providers = data.providers || [];
  state.latestData = data;
  const warnings = providers.filter(
    (provider) => provider.severity === "warning" || provider.severity === "danger"
  );
  const okCount = providers.filter((provider) => provider.status === "ok").length;
  const primary = providers.find((provider) => provider.id === data.primaryProvider) || providers[0];
  const usageTotal = sumHourlyUsage(data.usage);
  const usageCoverage = data.usage?.coverageMinutes || 0;
  const tokenTotal = sumUsageTokens(data.usageStats);
  const recentCount = data.recentUsage?.events?.length || 0;

  elements.totalBalance.textContent = formatCurrency(data.totalCny || 0, "CNY");
  elements.refreshTime.textContent = formatDateTime(data.refreshedAt);
  elements.focusName.textContent = primary?.shortName || "未选择";
  elements.focusAmount.textContent = primary
    ? Number.isFinite(primary.amount)
      ? formatCurrency(primary.amount, primary.currency)
      : primary.statusLabel
    : "--";
  elements.usageAmount.textContent =
    usageTotal > 0 || usageCoverage >= 60 ? formatCurrency(usageTotal, "CNY") : "采样中";
  elements.usageMeta.textContent =
    usageCoverage > 0 ? `已采样 ${usageCoverage} 分钟` : "余额下降后显示金额";
  elements.usageTokens.textContent = tokenTotal ? formatInteger(tokenTotal) : "--";
  elements.usageRecent.textContent = recentCount ? `最近 ${recentCount} 条请求` : "等待上报";
  renderFocusOptions(providers, data.primaryProvider);
  renderQuotaWindows(data.quota);
  elements.moodText.textContent = warnings.length
    ? `${warnings.length} 项偏低`
    : `${okCount}/${providers.length} 正常`;
  elements.shell.dataset.mood = warnings.length ? "warning" : "calm";
  window.balancePet.setSummary({
    title: formatCurrency(data.totalCny || 0, "CNY"),
    detail: warnings.length ? `${warnings.length} 项偏低` : `${okCount}/${providers.length} 正常`,
    primaryProvider: data.primaryProvider,
    titles: buildTrayTitles(data, providers),
    providerLabels: Object.fromEntries(
      providers.map((provider) => [provider.id, provider.shortName])
    ),
    quotaLabels: Object.fromEntries(
      collectQuotaTrayEntries(data.quota).map((entry) => [entry.mode, entry.label])
    ),
    quotaDetailLines: buildQuotaDetailLines(data.quota)
  });

  elements.providerList.innerHTML = providers.map(renderProvider).join("");
}

function buildQuotaDetailLines(quota) {
  const service =
    (quota?.services || []).find((item) => item.serviceId === "claude") || quota?.primaryService || null;
  if (!service) return [];

  const sessionWindow = service.windows?.find((window) => window.id === "5h");
  const weeklyWindow = service.windows?.find((window) => window.id === "weekly");

  return [
    quotaDetailLine("会话 (5h)", sessionWindow),
    quotaDetailLine("每周", weeklyWindow)
  ].filter(Boolean);
}

function quotaDetailLine(label, window) {
  if (!window) return null;
  const remaining = Number.isFinite(window.remainingPercent) ? `剩余 ${Math.round(window.remainingPercent)}%` : "--";
  const reset = window.resetsAt ? `${formatResetTime(window.resetsAt)} 重置` : "重置时间未知";
  return `${label} ${remaining} · ${reset}`;
}

function renderQuotaWindows(quota) {
  const service =
    (quota?.services || []).find((item) => item.serviceId === "claude") || quota?.primaryService || null;
  const sessionWindow = service?.windows?.find((window) => window.id === "5h");
  const weeklyWindow = service?.windows?.find((window) => window.id === "weekly");

  applyQuotaWindow(elements.quotaSessionRemain, elements.quotaSessionReset, sessionWindow);
  applyQuotaWindow(elements.quotaWeeklyRemain, elements.quotaWeeklyReset, weeklyWindow);
}

function applyQuotaWindow(remainEl, resetEl, window) {
  if (!window) {
    remainEl.textContent = "--";
    resetEl.textContent = "等待同步";
    return;
  }

  remainEl.textContent = Number.isFinite(window.remainingPercent)
    ? `剩余 ${Math.round(window.remainingPercent)}%`
    : "--";
  resetEl.textContent = window.resetsAt ? `${formatResetTime(window.resetsAt)} 重置` : "重置时间未知";
}

function formatResetTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  return sameDay
    ? date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function renderProvider(provider) {
  const isPrimary = state.latestData?.primaryProvider === provider.id;
  const amount = Number.isFinite(provider.amount)
    ? formatCurrency(provider.amount, provider.currency)
    : "--";

  return `
    <article class="provider-row ${provider.severity} ${isPrimary ? "is-primary" : ""}" style="--accent: ${provider.accent}">
      <span class="provider-mark" style="--accent: ${provider.accent}">${provider.shortName.slice(
        0,
        1
      )}</span>
      <div>
        <strong>${escapeHtml(provider.shortName)}</strong>
        <small>${escapeHtml(provider.statusLabel)}</small>
      </div>
      <b>${amount}</b>
      <button
        class="primary-toggle"
        style="--accent: ${provider.accent}"
        type="button"
        data-primary-provider="${escapeHtml(provider.id)}"
        aria-label="${isPrimary ? "当前重点关注" : "设为重点关注"}"
        ${isPrimary ? "disabled" : ""}
      >${isPrimary ? "★" : "☆"}</button>
    </article>
  `;
}

function renderFocusOptions(providers, primaryProvider) {
  elements.focusSelect.innerHTML = providers
    .map(
      (provider) => `
        <option value="${escapeHtml(provider.id)}" ${provider.id === primaryProvider ? "selected" : ""}>
          ${escapeHtml(provider.shortName)} · ${escapeHtml(provider.statusLabel)}
        </option>
      `
    )
    .join("");
}

function buildTrayTitles(data, providers) {
  const titles = {
    total: formatCurrency(data.totalCny || 0, "CNY")
  };
  const primary = providers.find((provider) => provider.id === data.primaryProvider);
  if (primary) {
    titles.primary = `${primary.shortName} ${
      Number.isFinite(primary.amount) ? formatCurrency(primary.amount, primary.currency) : "--"
    }`;
  }
  const usageTotal = sumHourlyUsage(data.usage);
  titles.usage24h = usageTotal > 0 ? `消耗 ${formatCurrency(usageTotal, "CNY")}` : "消耗 采样中";

  for (const provider of providers) {
    const amount = Number.isFinite(provider.amount)
      ? formatCurrency(provider.amount, provider.currency)
      : "--";
    titles[provider.id] = `${provider.shortName} ${amount}`;
  }
  for (const entry of collectQuotaTrayEntries(data.quota)) {
    titles[entry.mode] = entry.title;
  }

  return titles;
}

function collectQuotaTrayEntries(quota) {
  return (quota?.services || [])
    .map((service) => {
      const window = chooseQuotaWindow(service);
      if (!window) return null;

      const serviceName = service.serviceName || service.serviceId || "Quota";
      return {
        mode: `quota:${service.serviceId}`,
        label: serviceName,
        title: `${serviceName} ${formatQuotaWindowValue(window)}`
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

function sumUsageTokens(stats) {
  return (stats?.groups || []).reduce((sum, group) => sum + (group.totalTokens || 0), 0);
}

function renderError(error) {
  elements.moodText.textContent = "同步失败";
  elements.totalBalance.textContent = "--";
  elements.refreshTime.textContent = error?.message || "请检查配置";
  elements.focusName.textContent = "读取失败";
  elements.focusAmount.textContent = "--";
  elements.shell.dataset.mood = "danger";
  renderQuotaWindows(null);
  window.balancePet.setSummary({
    title: "",
    detail: "同步失败"
  });
}

async function toggleCollapse() {
  state.collapsed = !state.collapsed;
  elements.shell.classList.toggle("is-collapsed", state.collapsed);
  elements.collapseButton.textContent = state.collapsed ? "+" : "−";
  await window.balancePet.collapse(state.collapsed);
}

async function togglePin() {
  state.pinned = !state.pinned;
  elements.pinButton.classList.toggle("is-off", !state.pinned);
  await window.balancePet.pin(state.pinned);
}

function setControlsDisabled(disabled) {
  elements.refreshButton.disabled = disabled;
  elements.focusSelect.disabled = disabled;
  for (const button of elements.providerList.querySelectorAll("[data-primary-provider]")) {
    button.disabled = disabled || button.closest(".provider-row")?.classList.contains("is-primary");
  }
}

function formatDateTime(value) {
  if (!value) return "等待刷新";
  return new Date(value).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function formatCurrency(value, currency = "CNY") {
  const normalized = String(currency || "CNY").toUpperCase();
  try {
    return new Intl.NumberFormat("zh-CN", {
      style: "currency",
      currency: normalized,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  } catch {
    return `${compactFormatter.format(value)} ${normalized}`.trim();
  }
}

function formatInteger(value) {
  return new Intl.NumberFormat("zh-CN").format(Number(value) || 0);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
