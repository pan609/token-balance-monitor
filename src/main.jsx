import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AlertTriangle,
  Activity,
  BarChart3,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  ExternalLink,
  Filter,
  KeyRound,
  Layers3,
  Loader2,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Table2,
  WalletCards,
  XCircle
} from "lucide-react";
import "./styles.css";

const compactFormatter = new Intl.NumberFormat("zh-CN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const defaultProviders = ["阿里云", "Kimi", "DeepSeek", "硅基流动", "豆包", "Router"];
const appBasePath = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
const viewHashMap = {
  "#overview": "overview",
  "#usage-dashboard": "usage",
  "#providers": "providers",
  "#settings": "settings"
};

const viewCopy = {
  overview: {
    eyebrow: "Token 资金账户",
    title: "模型服务余额看板"
  },
  usage: {
    eyebrow: "Usage Observatory",
    title: "用量分析"
  },
  providers: {
    eyebrow: "Provider Accounts",
    title: "平台余额"
  },
  settings: {
    eyebrow: "Connection Status",
    title: "接入状态"
  }
};

function apiUrl(path) {
  return `${appBasePath}${path}`;
}

function getInitialView() {
  return viewHashMap[window.location.hash] || "overview";
}

function App() {
  const [activeView, setActiveView] = useState(getInitialView);
  const [data, setData] = useState(null);
  const [usage, setUsage] = useState(null);
  const [usageStats, setUsageStats] = useState(null);
  const [recentUsage, setRecentUsage] = useState(null);
  const [usageDashboard, setUsageDashboard] = useState(null);
  const [usageHours, setUsageHours] = useState("24");
  const [usageGroupBy, setUsageGroupBy] = useState("projectId");
  const [usageStatus, setUsageStatus] = useState("");
  const [usageQuery, setUsageQuery] = useState("");
  const [selectedUsageEvent, setSelectedUsageEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    document.body.classList.toggle("drawer-open", Boolean(selectedUsageEvent));
    return () => document.body.classList.remove("drawer-open");
  }, [selectedUsageEvent]);

  const refresh = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const response = await fetch(apiUrl("/api/balances"), {
        headers: { Accept: "application/json" }
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const nextData = await response.json();
      setData(nextData);

      const dashboardParams = new URLSearchParams({
        hours: usageHours,
        groupBy: usageGroupBy
      });
      if (usageStatus) dashboardParams.set("status", usageStatus);
      if (usageQuery.trim()) dashboardParams.set("q", usageQuery.trim());

      const eventParams = new URLSearchParams(dashboardParams);
      eventParams.set("limit", "80");

      const [
        usageResponse,
        statsResponse,
        recentResponse,
        overviewResponse,
        timelineResponse,
        breakdownResponse,
        eventsResponse
      ] = await Promise.all([
        fetch(apiUrl("/api/usage/hourly?hours=24"), {
          headers: { Accept: "application/json" }
        }),
        fetch(apiUrl("/api/usage/stats?hours=24&groupBy=projectId"), {
          headers: { Accept: "application/json" }
        }),
        fetch(apiUrl("/api/usage/recent?limit=20"), {
          headers: { Accept: "application/json" }
        }),
        fetch(apiUrl(`/api/usage/overview?${dashboardParams}`), {
          headers: { Accept: "application/json" }
        }),
        fetch(apiUrl(`/api/usage/timeline?${dashboardParams}`), {
          headers: { Accept: "application/json" }
        }),
        fetch(apiUrl(`/api/usage/breakdown?${dashboardParams}`), {
          headers: { Accept: "application/json" }
        }),
        fetch(apiUrl(`/api/usage/events?${eventParams}`), {
          headers: { Accept: "application/json" }
        })
      ]);
      if (usageResponse.ok) {
        setUsage(await usageResponse.json());
      }
      if (statsResponse.ok) {
        setUsageStats(await statsResponse.json());
      }
      if (recentResponse.ok) {
        setRecentUsage(await recentResponse.json());
      }
      const nextDashboard = {};
      if (overviewResponse.ok) nextDashboard.overview = await overviewResponse.json();
      if (timelineResponse.ok) nextDashboard.timeline = await timelineResponse.json();
      if (breakdownResponse.ok) nextDashboard.breakdown = await breakdownResponse.json();
      if (eventsResponse.ok) nextDashboard.events = await eventsResponse.json();
      setUsageDashboard(nextDashboard);
    } catch (fetchError) {
      setError(fetchError.message || "刷新失败");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [usageGroupBy, usageHours, usageQuery, usageStatus]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      refresh({ silent: true });
    }, 60 * 1000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    const handleHashChange = () => {
      setActiveView(getInitialView());
    };
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  const providers = data?.providers || [];
  const configuredCount = providers.filter(
    (provider) => provider.status !== "not_configured"
  ).length;
  const okCount = providers.filter((provider) => provider.status === "ok").length;
  const alertCount = providers.filter(
    (provider) => provider.severity === "warning" || provider.severity === "danger"
  ).length;
  const providerTotal = providers.length || defaultProviders.length;
  const total = data?.totalCny || 0;
  const usageTotal24h = useMemo(() => sumUsage(usage), [usage]);
  const usageMetricValue =
    usage && usageTotal24h <= 0 && (usage.snapshotCount < 2 || usage.coverageMinutes < 60)
      ? "采样中"
      : formatCurrency(usageTotal24h, "CNY");
  const currentView = viewCopy[activeView] || viewCopy.overview;

  const navigateView = (view) => {
    setActiveView(view);
    const hash = Object.entries(viewHashMap).find(([, value]) => value === view)?.[0] || "#overview";
    if (window.location.hash !== hash) {
      window.history.replaceState(null, "", hash);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <main className="app-shell">
      <aside className="side-rail" aria-label="功能导航">
        <div className="brand-lockup">
          <div className="brand-mark">
            <WalletCards size={22} />
          </div>
          <div>
            <strong>AI Meter</strong>
            <span>Balance · Usage</span>
          </div>
        </div>

        <nav className="app-nav">
          <NavButton
            active={activeView === "overview"}
            icon={<WalletCards />}
            label="总览"
            meta={`${okCount}/${providerTotal} 正常`}
            onClick={() => navigateView("overview")}
          />
          <NavButton
            active={activeView === "usage"}
            icon={<BarChart3 />}
            label="请求明细"
            meta={`${formatInteger(usageDashboard?.overview?.totalTokens || 0)} tokens`}
            onClick={() => navigateView("usage")}
          />
          <NavButton
            active={activeView === "providers"}
            icon={<KeyRound />}
            label="平台余额"
            meta={`${configuredCount}/${providerTotal} 已配置`}
            onClick={() => navigateView("providers")}
          />
          <NavButton
            active={activeView === "settings"}
            icon={<Settings2 />}
            label="接入状态"
            meta={alertCount ? `${alertCount} 项关注` : ".env"}
            onClick={() => navigateView("settings")}
          />
        </nav>

        <div className="rail-footer">
          <ShieldCheck size={17} />
          <span>密钥仅在本机服务端读取</span>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">{currentView.eyebrow}</p>
            <h1>{currentView.title}</h1>
          </div>
          <button className="primary-button" onClick={refresh} disabled={loading}>
            {loading ? <Loader2 className="spin" size={18} /> : <RefreshCw size={18} />}
            刷新余额
          </button>
        </header>

        {activeView !== "usage" ? (
          <section className="summary-band" aria-label="账户总览">
            <div className="summary-main">
              <span className="summary-label">总可用余额</span>
              <strong>{formatCurrency(total, "CNY")}</strong>
              <span className="summary-subline">
                {data?.refreshedAt ? `${formatDateTime(data.refreshedAt)} · 仅汇总 CNY` : "等待同步"}
              </span>
            </div>
            <MetricTile label="已配置" value={`${configuredCount}/${providerTotal}`} icon={<KeyRound />} />
            <MetricTile label="同步成功" value={`${okCount}/${providerTotal}`} icon={<CheckCircle2 />} />
            <MetricTile label="近 24h 消耗" value={usageMetricValue} icon={<BarChart3 />} />
            <MetricTile label="需要关注" value={String(alertCount)} icon={<AlertTriangle />} />
          </section>
        ) : null}

        {error ? (
          <div className="error-banner">
            <XCircle size={18} />
            <span>刷新失败：{error}</span>
          </div>
        ) : null}

        {activeView === "overview" ? (
          <OverviewView
            usage={usage}
            providers={providers}
            usageStats={usageStats}
            recentUsage={recentUsage}
          />
        ) : null}

        {activeView === "usage" ? (
          <UsageDashboard
            dashboard={usageDashboard}
            hours={usageHours}
            groupBy={usageGroupBy}
            status={usageStatus}
            query={usageQuery}
            onHoursChange={setUsageHours}
            onGroupByChange={setUsageGroupBy}
            onStatusChange={setUsageStatus}
            onQueryChange={setUsageQuery}
            onRefresh={() => refresh()}
            onSelectEvent={setSelectedUsageEvent}
          />
        ) : null}

        {activeView === "providers" ? (
          <ProvidersView providers={providers} threshold={data?.thresholdCny || 0} />
        ) : null}

        {activeView === "settings" ? <SettingsView providers={providers} /> : null}
      </section>

      {selectedUsageEvent ? (
        <UsageEventDrawer
          event={selectedUsageEvent}
          onClose={() => setSelectedUsageEvent(null)}
        />
      ) : null}
    </main>
  );
}

function NavButton({ active, icon, label, meta, onClick }) {
  return (
    <button
      type="button"
      className={`app-nav-item ${active ? "active" : ""}`}
      onClick={onClick}
    >
      <span>{React.cloneElement(icon, { size: 17 })}</span>
      <strong>{label}</strong>
      <small>{meta}</small>
    </button>
  );
}

function OverviewView({ usage, providers, usageStats, recentUsage }) {
  return (
    <>
      <section className="lower-layout">
        <div className="trend-panel">
          <PanelTitle
            icon={<CircleDollarSign size={18} />}
            title="小时消耗"
            action={usage?.snapshotCount ? `${usage.snapshotCount} 条快照` : "等待快照"}
          />
          <UsageChart usage={usage} providers={providers} />
        </div>

        <div className="request-panel">
          <PanelTitle
            icon={<BarChart3 size={18} />}
            title="项目来源统计"
            action="近 24h"
          />
          <UsageStatsTable stats={usageStats} />
        </div>
      </section>

      <section className="request-layout compact">
        <div className="request-panel">
          <PanelTitle
            icon={<Clock3 size={18} />}
            title="最近请求"
            action={recentUsage?.events?.length ? `${recentUsage.events.length} 条` : "等待上报"}
          />
          <RecentUsageList events={recentUsage?.events || []} />
        </div>
      </section>
    </>
  );
}

function ProvidersView({ providers, threshold }) {
  return (
    <section className="provider-grid" aria-label="供应商余额">
      {providers.length === 0
        ? defaultProviders.map((name) => <ProviderSkeleton key={name} />)
        : providers.map((provider) => (
            <ProviderCard key={provider.id} provider={provider} threshold={threshold} />
          ))}
    </section>
  );
}

function SettingsView({ providers }) {
  return (
    <section className="settings-layout">
      <div className="config-panel">
        <PanelTitle icon={<Settings2 size={18} />} title="平台接入状态" action=".env" />
        <div className="config-list">
          {providers.map((provider) => (
            <div className="config-row" key={provider.id}>
              <span
                className="config-icon"
                style={{ "--provider-accent": provider.accent }}
              >
                <span className={`status-dot ${provider.severity}`} />
              </span>
              <div>
                <strong>{provider.name}</strong>
                <span>{provider.details || provider.message}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function MetricTile({ label, value, icon }) {
  return (
    <div className="metric-tile">
      <span>{React.cloneElement(icon, { size: 18 })}</span>
      <div>
        <strong>{value}</strong>
        <small>{label}</small>
      </div>
    </div>
  );
}

function ProviderCard({ provider, threshold }) {
  const consoleUrl = provider.consoleUrl;
  const amount = Number.isFinite(provider.amount) ? provider.amount : null;
  const currency = provider.currency || "CNY";
  const isCny = currency.toUpperCase() === "CNY";
  const ratio =
    amount === null || !isCny
      ? 0
      : Math.max(0, Math.min(100, (amount / Math.max(threshold * 2, 1)) * 100));

  return (
    <article
      className={`provider-card ${provider.severity}`}
      id={provider.id}
      style={{ "--provider-accent": provider.accent }}
    >
      <header className="card-header">
        <div>
          <span className="provider-initial">{provider.shortName.slice(0, 1)}</span>
          <div>
            <h2>{provider.name}</h2>
            <p>{provider.message}</p>
          </div>
        </div>
        <StatusBadge provider={provider} />
      </header>

      <div className="balance-line">
        <span>可用余额</span>
        <strong>{amount === null ? "--" : formatCurrency(amount, currency)}</strong>
      </div>

      {isCny ? (
        <>
          <div className="threshold-track" aria-label="低余额阈值">
            <span style={{ width: `${ratio}%` }} />
          </div>
          <div className="threshold-copy">
            <span>阈值 {formatCurrency(threshold, "CNY")}</span>
            <span>{amount === null ? "等待配置" : provider.statusLabel}</span>
          </div>
        </>
      ) : (
        <div className="foreign-currency-note">外币余额单独显示，不计入 CNY 总额</div>
      )}

      {provider.metrics?.length ? (
        <div className="metric-list">
          {provider.metrics.slice(0, 4).map((metric) => (
            <div className="metric-row" key={metric.label}>
              <span>{metric.label}</span>
              <strong>{formatMetric(metric)}</strong>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-provider-note">{provider.details || "等待余额数据"}</div>
      )}

      <footer className="card-actions">
        {consoleUrl ? (
          <a href={consoleUrl} target="_blank" rel="noreferrer">
            控制台 <ExternalLink size={14} />
          </a>
        ) : null}
        <a href={provider.docsUrl} target="_blank" rel="noreferrer">
          接口文档 <ExternalLink size={14} />
        </a>
      </footer>
    </article>
  );
}

function StatusBadge({ provider }) {
  const icons = {
    healthy: <CheckCircle2 size={15} />,
    warning: <AlertTriangle size={15} />,
    danger: <XCircle size={15} />,
    neutral: <Clock3 size={15} />
  };

  return (
    <span className={`status-badge ${provider.severity}`}>
      {icons[provider.severity] || icons.neutral}
      {provider.statusLabel}
    </span>
  );
}

function ProviderSkeleton() {
  return (
    <article className="provider-card skeleton-card">
      <div className="skeleton-line short" />
      <div className="skeleton-line amount" />
      <div className="skeleton-line" />
      <div className="skeleton-line" />
    </article>
  );
}

function PanelTitle({ icon, title, action }) {
  return (
    <div className="panel-title">
      <div>
        {icon}
        <strong>{title}</strong>
      </div>
      <span>{action}</span>
    </div>
  );
}

function UsageChart({ usage, providers }) {
  const buckets = usage?.buckets || [];
  const providerMap = new Map(providers.map((provider) => [provider.id, provider]));
  const visibleBuckets = buckets.slice(-12);
  const maxAmount = Math.max(...visibleBuckets.map((bucket) => bucket.amountCny), 0);

  if (!usage) {
    return <div className="empty-trend">正在读取服务端消耗历史</div>;
  }

  if (!buckets.length || maxAmount <= 0) {
    return (
      <div className="usage-empty-state">
        <strong>还没有形成消耗曲线</strong>
        <span>
          {usage.coverageMinutes > 0
            ? `当前已采样 ${usage.coverageMinutes} 分钟；余额发生下降后，这里会按小时估算消耗。`
            : "服务端会每分钟记录余额快照；余额发生下降后，这里会按小时估算消耗。"}
        </span>
      </div>
    );
  }

  return (
    <div className="usage-chart">
      <div className="usage-bars" aria-label="近 12 小时消耗柱状图">
        {visibleBuckets.map((bucket) => {
          const height = Math.max(8, (bucket.amountCny / maxAmount) * 100);
          return (
            <div className="usage-bar-item" key={bucket.key}>
              <div className="usage-bar-track">
                <span style={{ height: `${height}%` }} />
              </div>
              <strong>{formatCurrency(bucket.amountCny, "CNY")}</strong>
              <small>{formatHourLabel(bucket.startedAt)}</small>
            </div>
          );
        })}
      </div>

      <div className="usage-breakdown">
        {buckets
          .slice(-6)
          .reverse()
          .map((bucket) => (
            <div className="usage-hour-row" key={bucket.key}>
              <div>
                <strong>{formatHourLabel(bucket.startedAt)}</strong>
                <span>{formatCurrency(bucket.amountCny, "CNY")} · token 待接入</span>
              </div>
              <div className="usage-provider-pills">
                {bucket.providers.slice(0, 3).map((provider) => {
                  const meta = providerMap.get(provider.id);
                  return (
                    <span
                      key={provider.id}
                      style={{ "--provider-accent": meta?.accent || "#64748b" }}
                    >
                      {provider.shortName}
                      <b>{formatCurrency(provider.amountCny, "CNY")}</b>
                    </span>
                  );
                })}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}

function UsageStatsTable({ stats }) {
  const groups = stats?.groups || [];
  if (!stats) {
    return <div className="empty-requests">正在读取请求级 token 统计</div>;
  }

  if (!groups.length) {
    return (
      <div className="empty-requests">
        还没有请求级 usage 上报。接入 SDK 后，这里会按项目、账号、功能聚合 token。
      </div>
    );
  }

  return (
    <div className="usage-stats-table">
      <div className="usage-stats-head">
        <span>项目</span>
        <span>请求</span>
        <span>Token</span>
        <span>估算费用</span>
      </div>
      {groups.slice(0, 8).map((group) => (
        <div className="usage-stats-row" key={group.key}>
          <strong>{group.label}</strong>
          <span>{formatInteger(group.eventCount)}</span>
          <span>{formatInteger(group.totalTokens)}</span>
          <span>{formatCost(group.estimatedCost, group.currency)}</span>
        </div>
      ))}
    </div>
  );
}

function RecentUsageList({ events }) {
  if (!events.length) {
    return (
      <div className="empty-requests">
        默认不会保存 prompt 或 response。业务项目上报 usage 后，最近请求会显示在这里。
      </div>
    );
  }

  return (
    <div className="recent-usage-list">
      {events.slice(0, 10).map((event) => (
        <div className="recent-usage-row" key={`${event.requestId}-${event.createdAt}`}>
          <div className="recent-usage-main">
            <strong>{eventTitle(event)}</strong>
            <span>
              {event.projectId} / {displayAccount(event)} / {event.model}
            </span>
          </div>
          <div className="recent-usage-meta">
            <strong>{formatInteger(event.totalTokens)} tokens</strong>
            <span>
              {formatTime(event.createdAt)}
              {displayActor(event) !== "--" ? ` · ${displayActor(event)}` : ""}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function UsageDashboard({
  dashboard,
  hours,
  groupBy,
  status,
  query,
  onHoursChange,
  onGroupByChange,
  onStatusChange,
  onQueryChange,
  onRefresh,
  onSelectEvent
}) {
  const overview = dashboard?.overview;
  const timeline = dashboard?.timeline;
  const breakdown = dashboard?.breakdown;
  const events = dashboard?.events;
  const buckets = timeline?.buckets || [];
  const maxTokens = Math.max(...buckets.map((bucket) => bucket.totalTokens || 0), 0);

  return (
    <section className="usage-dashboard" id="usage-dashboard" aria-label="请求明细看板">
      <div className="usage-dashboard-head">
        <div>
          <p className="eyebrow">Usage Observatory</p>
          <h2>请求明细看板</h2>
          <span>只记录结构化用量，不保存 prompt 和 response。</span>
        </div>
        <button className="secondary-button" type="button" onClick={onRefresh}>
          <RefreshCw size={17} />
          刷新看板
        </button>
      </div>

      <div className="usage-filter-bar">
        <label>
          <Filter size={15} />
          <select value={hours} onChange={(event) => onHoursChange(event.target.value)}>
            <option value="1">近 1 小时</option>
            <option value="24">近 24 小时</option>
            <option value="168">近 7 天</option>
            <option value="720">近 30 天</option>
          </select>
        </label>
        <label>
          <Layers3 size={15} />
          <select value={groupBy} onChange={(event) => onGroupByChange(event.target.value)}>
            <option value="projectId">按项目</option>
            <option value="provider">按平台</option>
            <option value="model">按模型</option>
            <option value="feature">按操作</option>
            <option value="accountId">按账号</option>
            <option value="actorId">按触发人</option>
            <option value="resourceType">按资源类型</option>
            <option value="environment">按环境</option>
            <option value="userHash">按匿名用户</option>
          </select>
        </label>
        <label>
          <Activity size={15} />
          <select value={status} onChange={(event) => onStatusChange(event.target.value)}>
            <option value="">全部状态</option>
            <option value="success">成功</option>
            <option value="error">失败</option>
          </select>
        </label>
        <label className="usage-search">
          <Search size={15} />
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="搜索项目、操作、账号、触发人、资源、requestId"
          />
        </label>
      </div>

      <div className="usage-kpis">
        <UsageKpi label="请求数" value={formatInteger(overview?.eventCount || 0)} />
        <UsageKpi label="总 Token" value={formatInteger(overview?.totalTokens || 0)} />
        <UsageKpi label="平均 Token" value={formatInteger(overview?.averageTokens || 0)} />
        <UsageKpi label="失败率" value={formatPercent(overview?.failureRate || 0)} />
        <UsageKpi
          label="估算费用"
          value={formatCost(overview?.estimatedCost, overview?.currency)}
        />
        <UsageKpi
          label="平均耗时"
          value={overview?.averageLatencyMs ? formatDuration(overview.averageLatencyMs) : "--"}
        />
      </div>

      <div className="usage-dashboard-grid">
        <section className="usage-dashboard-panel">
          <PanelTitle
            icon={<BarChart3 size={18} />}
            title="Token 趋势"
            action={timeline?.bucket === "day" ? "按天" : "按小时"}
          />
          {buckets.length && maxTokens > 0 ? (
            <div className="token-timeline">
              {buckets.slice(-18).map((bucket) => {
                const height = Math.max(6, ((bucket.totalTokens || 0) / maxTokens) * 100);
                return (
                  <div className="token-timeline-item" key={bucket.key}>
                    <div>
                      <span style={{ height: `${height}%` }} />
                    </div>
                    <strong>{formatCompactNumber(bucket.totalTokens)}</strong>
                    <small>{formatTimelineLabel(bucket.startedAt, timeline.bucket)}</small>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="empty-requests">当前筛选条件下还没有 token 趋势。</div>
          )}
        </section>

        <section className="usage-dashboard-panel">
          <PanelTitle
            icon={<Table2 size={18} />}
            title={breakdownTitle(groupBy)}
            action={`${breakdown?.groups?.length || 0} 组`}
          />
          <UsageBreakdownTable groups={breakdown?.groups || []} />
        </section>
      </div>

      <section className="usage-dashboard-panel">
        <PanelTitle
          icon={<Clock3 size={18} />}
          title="请求明细"
          action={`${formatInteger(events?.total || 0)} 条`}
        />
        <UsageEventTable events={events?.events || []} onSelectEvent={onSelectEvent} />
      </section>
    </section>
  );
}

function UsageKpi({ label, value }) {
  return (
    <div className="usage-kpi">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function UsageBreakdownTable({ groups }) {
  if (!groups.length) {
    return <div className="empty-requests">当前筛选条件下没有聚合数据。</div>;
  }

  return (
    <div className="usage-breakdown-table">
      <div className="usage-breakdown-head">
        <span>维度</span>
        <span>请求</span>
        <span>Token</span>
        <span>失败率</span>
        <span>费用</span>
      </div>
      {groups.slice(0, 12).map((group) => (
        <div className="usage-breakdown-row" key={group.key}>
          <strong title={group.label}>{group.label}</strong>
          <span>{formatInteger(group.eventCount)}</span>
          <span>{formatInteger(group.totalTokens)}</span>
          <span>{formatPercent(group.failureRate || 0)}</span>
          <span>{formatCost(group.estimatedCost, group.currency)}</span>
        </div>
      ))}
    </div>
  );
}

function UsageEventTable({ events, onSelectEvent }) {
  if (!events.length) {
    return <div className="empty-requests">当前筛选条件下没有请求明细。</div>;
  }

  return (
    <div className="usage-event-table">
      <div className="usage-event-head">
        <span>时间</span>
        <span>项目</span>
        <span>环境</span>
        <span>操作</span>
        <span>账号</span>
        <span>触发人</span>
        <span>资源</span>
        <span>Provider</span>
        <span>模型</span>
        <span>Total Token</span>
        <span>状态</span>
      </div>
      {events.map((event) => (
        <button
          className="usage-event-row"
          type="button"
          key={`${event.requestId}-${event.createdAt}`}
          onClick={() => onSelectEvent(event)}
        >
          <span>{formatDateTime(event.createdAt)}</span>
          <strong title={event.projectId}>
            {event.projectId}
            <small>{event.requestId}</small>
          </strong>
          <span>{event.environment || "--"}</span>
          <strong title={`${event.operationName || ""} ${event.feature || ""}`}>
            {eventTitle(event)}
            <small>{event.feature || "--"}</small>
          </strong>
          <span title={`${event.accountName || ""} ${event.accountId || ""}`}>
            {displayAccount(event)}
            <small>{event.accountId || "--"}</small>
          </span>
          <span title={`${event.actorName || ""} ${event.actorId || event.userHash || ""}`}>
            {displayActor(event)}
            <small>{event.actorId || (event.userHash ? `匿名 ${shortHash(event.userHash)}` : "--")}</small>
          </span>
          <span title={`${event.resourceName || ""} ${event.resourceType || ""} ${event.resourceId || ""}`}>
            {displayResource(event)}
            <small>{event.resourceType || "--"}</small>
          </span>
          <span>{event.provider}</span>
          <span title={event.model}>
            {event.model}
            <small>
              {formatInteger(event.promptTokens ?? event.inputTokens)} /{" "}
              {formatInteger(event.completionTokens ?? event.outputTokens)}
            </small>
          </span>
          <b>{formatInteger(event.totalTokens)}</b>
          <span className={`event-status ${event.status === "error" ? "error" : "success"}`}>
            {event.status === "error" ? "失败" : "成功"}
          </span>
        </button>
      ))}
    </div>
  );
}

function UsageEventDrawer({ event, onClose }) {
  const runtimeMs = event.durationMs ?? event.latencyMs;

  return (
    <div className="drawer-backdrop" role="presentation" onClick={onClose}>
      <aside
        className="usage-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="请求详情"
        onClick={(clickEvent) => clickEvent.stopPropagation()}
      >
        <header>
          <div>
            <p className="eyebrow">Request Detail</p>
            <h2>{eventTitle(event)}</h2>
            <span>{formatDateTime(event.createdAt)}</span>
          </div>
          <button type="button" onClick={onClose} aria-label="关闭请求详情">
            <XCircle size={21} />
          </button>
        </header>

        <div className="drawer-token-grid">
          <UsageKpi label="总 Token" value={formatInteger(event.totalTokens)} />
          <UsageKpi label="Prompt" value={formatInteger(event.promptTokens ?? event.inputTokens)} />
          <UsageKpi label="Completion" value={formatInteger(event.completionTokens ?? event.outputTokens)} />
          <UsageKpi label="Reasoning" value={formatInteger(event.reasoningTokens)} />
        </div>

        <dl className="event-detail-list">
          <DetailRow label="项目" value={event.projectId} />
          <DetailRow label="环境" value={event.environment} />
          <DetailRow label="操作" value={eventTitle(event)} />
          <DetailRow label="操作 Key" value={event.feature || "--"} />
          <DetailRow label="账号" value={displayAccount(event)} />
          <DetailRow label="账号 ID" value={event.accountId || "--"} />
          <DetailRow label="触发人" value={displayActor(event)} />
          <DetailRow label="触发人 ID" value={event.actorId || "--"} />
          <DetailRow label="资源" value={displayResource(event)} />
          <DetailRow label="资源类型" value={event.resourceType || "--"} />
          <DetailRow label="资源 ID" value={event.resourceId || "--"} />
          <DetailRow label="平台" value={event.provider} />
          <DetailRow label="模型" value={event.model} />
          <DetailRow label="状态" value={event.status} />
          <DetailRow label="耗时" value={runtimeMs ? formatDuration(runtimeMs) : "--"} />
          <DetailRow label="估算费用" value={formatCost(event.estimatedCost, event.currency)} />
          <DetailRow label="requestId" value={event.requestId} />
          <DetailRow label="upstreamRequestId" value={event.upstreamRequestId || "--"} />
        </dl>

        <section className="metadata-panel">
          <strong>Attributes</strong>
          <pre>{JSON.stringify(event.attributes || {}, null, 2)}</pre>
        </section>

        <section className="metadata-panel">
          <strong>Metadata</strong>
          <pre>{JSON.stringify(event.metadata || {}, null, 2)}</pre>
        </section>

        <section className="metadata-panel">
          <strong>Raw Usage</strong>
          <pre>{JSON.stringify(event.rawUsage || {}, null, 2)}</pre>
        </section>
      </aside>
    </div>
  );
}

function DetailRow({ label, value }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  );
}

function eventTitle(event) {
  return event?.operationName || event?.feature || "default";
}

function displayAccount(event) {
  return event?.accountName || event?.accountId || "--";
}

function displayActor(event) {
  return event?.actorName || event?.actorId || (event?.userHash ? `匿名 ${shortHash(event.userHash)}` : "--");
}

function displayResource(event) {
  if (event?.resourceName) return event.resourceName;
  if (event?.resourceType && event?.resourceId) return `${event.resourceType}:${event.resourceId}`;
  return event?.resourceType || event?.resourceId || "--";
}

function sumUsage(usage) {
  return (usage?.buckets || []).reduce((sum, bucket) => sum + (bucket.amountCny || 0), 0);
}

function formatHourLabel(value) {
  return new Date(value).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatTime(value) {
  return new Date(value).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function formatInteger(value) {
  return new Intl.NumberFormat("zh-CN").format(Number(value) || 0);
}

function formatCost(value, currency = "CNY") {
  if (!Number.isFinite(Number(value)) || Number(value) <= 0) return "--";
  return formatCurrency(Number(value), currency);
}

function shortHash(value) {
  return String(value || "").slice(0, 8);
}

function formatMetric(metric) {
  if (!Number.isFinite(metric.value)) return "--";
  return formatCurrency(metric.value, metric.currency);
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

function formatDateTime(value) {
  return new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function formatTimelineLabel(value, bucket) {
  const date = new Date(value);
  if (bucket === "day") {
    return date.toLocaleDateString("zh-CN", {
      month: "2-digit",
      day: "2-digit"
    });
  }
  return date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatCompactNumber(value) {
  const number = Number(value) || 0;
  if (number >= 1_000_000) return `${compactFormatter.format(number / 1_000_000)}m`;
  if (number >= 1000) return `${Math.round(number / 1000)}k`;
  return String(number);
}

function formatPercent(value) {
  return new Intl.NumberFormat("zh-CN", {
    style: "percent",
    minimumFractionDigits: 0,
    maximumFractionDigits: 1
  }).format(Number(value) || 0);
}

function formatDuration(value) {
  const milliseconds = Number(value);
  if (!Number.isFinite(milliseconds)) return "--";
  if (milliseconds < 1000) return `${Math.round(milliseconds)}ms`;
  return `${compactFormatter.format(milliseconds / 1000)}s`;
}

function breakdownTitle(groupBy) {
  const titles = {
    projectId: "项目排行",
    provider: "平台排行",
    model: "模型排行",
    feature: "操作排行",
    accountId: "账号排行",
    actorId: "触发人排行",
    resourceType: "资源类型排行",
    environment: "环境排行",
    userHash: "匿名用户排行"
  };
  return titles[groupBy] || "维度排行";
}

createRoot(document.getElementById("root")).render(<App />);
