import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  ExternalLink,
  KeyRound,
  Loader2,
  RefreshCw,
  Settings2,
  ShieldCheck,
  WalletCards,
  XCircle
} from "lucide-react";
import "./styles.css";

const compactFormatter = new Intl.NumberFormat("zh-CN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const defaultProviders = ["阿里云", "Kimi", "DeepSeek", "硅基流动", "豆包", "Router"];

function App() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [history, setHistory] = useState(() => readHistory());

  const refresh = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/balances", {
        headers: { Accept: "application/json" }
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const nextData = await response.json();
      setData(nextData);
      setHistory((previous) => {
        const nextHistory = appendHistory(previous, nextData);
        localStorage.setItem("balance-history", JSON.stringify(nextHistory));
        return nextHistory;
      });
    } catch (fetchError) {
      setError(fetchError.message || "刷新失败");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      refresh({ silent: true });
    }, 60 * 1000);
    return () => window.clearInterval(timer);
  }, [refresh]);

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

  const trend = useMemo(() => buildTrend(history), [history]);

  return (
    <main className="app-shell">
      <aside className="side-rail" aria-label="供应商导航">
        <div className="brand-lockup">
          <div className="brand-mark">
            <WalletCards size={22} />
          </div>
          <div>
            <strong>余额监控</strong>
            <span>AI Provider</span>
          </div>
        </div>

        <nav className="provider-nav">
          {providers.length === 0
            ? defaultProviders.map((name) => (
                <div className="provider-nav-item skeleton-nav" key={name}>
                  <span />
                  {name}
                </div>
              ))
            : providers.map((provider) => (
                <a
                  className="provider-nav-item"
                  href={`#${provider.id}`}
                  key={provider.id}
                  style={{ "--provider-accent": provider.accent }}
                >
                  <span className={`status-dot ${provider.severity}`} />
                  {provider.shortName}
                </a>
              ))}
        </nav>

        <div className="rail-footer">
          <ShieldCheck size={17} />
          <span>密钥仅在本机服务端读取</span>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Token 资金账户</p>
            <h1>模型服务余额看板</h1>
          </div>
          <button className="primary-button" onClick={refresh} disabled={loading}>
            {loading ? <Loader2 className="spin" size={18} /> : <RefreshCw size={18} />}
            刷新余额
          </button>
        </header>

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
          <MetricTile label="需要关注" value={String(alertCount)} icon={<AlertTriangle />} />
        </section>

        {error ? (
          <div className="error-banner">
            <XCircle size={18} />
            <span>刷新失败：{error}</span>
          </div>
        ) : null}

        <section className="provider-grid" aria-label="供应商余额">
          {providers.length === 0
            ? defaultProviders.map((name) => <ProviderSkeleton key={name} />)
            : providers.map((provider) => (
                <ProviderCard
                  key={provider.id}
                  provider={provider}
                  threshold={data.thresholdCny}
                />
              ))}
        </section>

        <section className="lower-layout">
          <div className="trend-panel">
            <PanelTitle
              icon={<CircleDollarSign size={18} />}
              title="余额刷新历史"
              action={history.length ? `${history.length} 次记录` : "暂无记录"}
            />
            <TrendChart trend={trend} providers={providers} />
          </div>

          <div className="config-panel">
            <PanelTitle icon={<Settings2 size={18} />} title="接入状态" action=".env" />
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
      </section>
    </main>
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

function TrendChart({ trend, providers }) {
  if (!trend.points.length) {
    return <div className="empty-trend">刷新后开始记录余额历史</div>;
  }

  return (
    <div className="trend-chart">
      <svg viewBox="0 0 640 240" role="img" aria-label="余额历史折线图">
        <defs>
          <linearGradient id="gridFade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#e2e8f0" />
            <stop offset="100%" stopColor="#f8fafc" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3].map((index) => (
          <line
            className="grid-line"
            key={index}
            x1="20"
            x2="620"
            y1={36 + index * 48}
            y2={36 + index * 48}
          />
        ))}
        {providers.map((provider) => {
          const path = trend.paths[provider.id];
          if (!path) return null;
          return (
            <path
              className="trend-path"
              d={path}
              key={provider.id}
              stroke={provider.accent}
            />
          );
        })}
        {trend.points.map((point, index) => (
          <text className="axis-label" x={point.x} y="224" key={index}>
            {point.label}
          </text>
        ))}
      </svg>
      <div className="trend-legend">
        {providers.map((provider) => (
          <span key={provider.id}>
            <i style={{ background: provider.accent }} />
            {provider.shortName}
          </span>
        ))}
      </div>
    </div>
  );
}

function readHistory() {
  try {
    const parsed = JSON.parse(localStorage.getItem("balance-history") || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function appendHistory(previous, nextData) {
  const values = {};
  for (const provider of nextData.providers || []) {
    if (provider.status === "ok" && Number.isFinite(provider.amount)) {
      values[provider.id] = provider.amount;
    }
  }

  if (!Object.keys(values).length) return previous;

  return [
    ...previous,
    {
      at: nextData.refreshedAt,
      values
    }
  ].slice(-16);
}

function buildTrend(history) {
  const width = 600;
  const height = 168;
  const left = 20;
  const top = 28;
  const points = history.map((item, index) => ({
    ...item,
    x: history.length === 1 ? left + width / 2 : left + (index / (history.length - 1)) * width,
    label: new Date(item.at).toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit"
    })
  }));

  const values = history.flatMap((item) => Object.values(item.values));
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = Math.max(max - min, 1);
  const providerIds = Array.from(
    new Set(history.flatMap((item) => Object.keys(item.values)))
  );

  const paths = {};
  for (const providerId of providerIds) {
    const commands = points
      .filter((point) => Number.isFinite(point.values[providerId]))
      .map((point, index) => {
        const y = top + height - ((point.values[providerId] - min) / span) * height;
        return `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${y.toFixed(2)}`;
      });
    if (commands.length) paths[providerId] = commands.join(" ");
  }

  return { points, paths };
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

createRoot(document.getElementById("root")).render(<App />);
