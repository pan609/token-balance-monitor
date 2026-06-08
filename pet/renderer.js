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

  elements.totalBalance.textContent = formatCurrency(data.totalCny || 0, "CNY");
  elements.refreshTime.textContent = formatDateTime(data.refreshedAt);
  elements.focusName.textContent = primary?.shortName || "未选择";
  elements.focusAmount.textContent = primary
    ? Number.isFinite(primary.amount)
      ? formatCurrency(primary.amount, primary.currency)
      : primary.statusLabel
    : "--";
  renderFocusOptions(providers, data.primaryProvider);
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
    )
  });

  elements.providerList.innerHTML = providers.map(renderProvider).join("");
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

  for (const provider of providers) {
    const amount = Number.isFinite(provider.amount)
      ? formatCurrency(provider.amount, provider.currency)
      : "--";
    titles[provider.id] = `${provider.shortName} ${amount}`;
  }

  return titles;
}

function renderError(error) {
  elements.moodText.textContent = "同步失败";
  elements.totalBalance.textContent = "--";
  elements.refreshTime.textContent = error?.message || "请检查配置";
  elements.focusName.textContent = "读取失败";
  elements.focusAmount.textContent = "--";
  elements.shell.dataset.mood = "danger";
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

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
