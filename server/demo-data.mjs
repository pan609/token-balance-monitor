const DEMO_EVENTS = [
  {
    projectId: "class-teacher",
    environment: "production",
    provider: "volc",
    model: "doubao-1-5-vision-pro-32k-250115",
    feature: "wrong_question_ocr",
    operationName: "上传错题",
    accountId: "org:1",
    accountName: "默认机构",
    actorId: "teacher:7",
    actorName: "潘老师",
    resourceType: "wrong_question",
    resourceId: "88",
    resourceName: "李明汐的数学错题",
    requestId: "demo-req-20260614-001",
    status: "success",
    promptTokens: 1280,
    completionTokens: 420,
    reasoningTokens: 0,
    totalTokens: 1700,
    durationMs: 1320,
    estimatedCost: 0.012,
    currency: "CNY",
    attributes: {
      classId: 2,
      subject: "数学",
      source: "questions_upload"
    },
    metadata: {
      demo: true
    },
    rawUsage: {
      prompt_tokens: 1280,
      completion_tokens: 420,
      total_tokens: 1700
    }
  },
  {
    projectId: "agent-demo",
    environment: "production",
    provider: "aliyun",
    model: "qwen-plus",
    feature: "agent_summary",
    operationName: "生成日报摘要",
    accountId: "workspace:demo",
    accountName: "Demo 工作区",
    actorId: "agent:daily",
    actorName: "日报 Agent",
    resourceType: "report",
    resourceId: "daily-2026-06-14",
    resourceName: "今日模型使用日报",
    requestId: "demo-req-20260614-002",
    status: "success",
    promptTokens: 860,
    completionTokens: 310,
    reasoningTokens: 0,
    totalTokens: 1170,
    durationMs: 920,
    estimatedCost: 0.008,
    currency: "CNY",
    attributes: {
      source: "agent_skill",
      channel: "terminal"
    },
    metadata: {
      demo: true
    },
    rawUsage: {
      prompt_tokens: 860,
      completion_tokens: 310,
      total_tokens: 1170
    }
  },
  {
    projectId: "class-teacher",
    environment: "production",
    provider: "deepseek",
    model: "deepseek-chat",
    feature: "answer_extract",
    operationName: "答案抽取",
    accountId: "org:1",
    accountName: "默认机构",
    actorId: "teacher:9",
    actorName: "李老师",
    resourceType: "exam_paper",
    resourceId: "paper:2048",
    resourceName: "八年级数学单元卷",
    requestId: "demo-req-20260614-003",
    status: "success",
    promptTokens: 1740,
    completionTokens: 680,
    reasoningTokens: 0,
    totalTokens: 2420,
    durationMs: 1680,
    estimatedCost: 0.01,
    currency: "CNY",
    attributes: {
      grade: "八年级",
      subject: "数学",
      source: "paper_upload"
    },
    metadata: {
      demo: true
    },
    rawUsage: {
      prompt_tokens: 1740,
      completion_tokens: 680,
      total_tokens: 2420
    }
  }
];

const PROVIDERS = [
  {
    id: "aliyun",
    name: "阿里云百炼",
    shortName: "阿里云",
    accent: "#ff6a00",
    amount: 12.62,
    currency: "CNY"
  },
  {
    id: "moonshot",
    name: "Kimi / Moonshot",
    shortName: "Kimi",
    accent: "#7c3aed",
    amount: 18.4,
    currency: "CNY"
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    shortName: "DeepSeek",
    accent: "#111827",
    amount: 7.08,
    currency: "CNY"
  },
  {
    id: "siliconflow",
    name: "SiliconFlow / 硅基流动",
    shortName: "硅基流动",
    accent: "#059669",
    amount: 6.2,
    currency: "CNY"
  },
  {
    id: "volcengine",
    name: "火山引擎 / 豆包",
    shortName: "豆包",
    accent: "#2f6bff",
    amount: 10,
    currency: "CNY"
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    shortName: "Router",
    accent: "#0f766e",
    amount: 5.28,
    currency: "USD",
    amountCny: null
  }
];

export function isDemoMode() {
  return String(process.env.TOKEN_MONITOR_DEMO || "").toLowerCase() === "true";
}

export function buildDemoBalances({ lowBalance = isLowBalanceDemo() } = {}) {
  const threshold = Number(process.env.LOW_BALANCE_THRESHOLD_CNY || 20);
  const refreshedAt = new Date().toISOString();
  const primaryProvider = process.env.PRIMARY_PROVIDER_ID || "aliyun";
  const providers = PROVIDERS.map((provider) => {
    const amount = lowBalance && provider.id === primaryProvider ? 1.42 : provider.amount;
    const isCny = provider.currency === "CNY";
    const amountCny = isCny ? amount : provider.amountCny;
    const isWarning = isCny && amount <= threshold;
    return {
      ...provider,
      docsUrl: "https://example.com/docs",
      consoleUrl: "https://example.com/console",
      status: "ok",
      amount,
      amountCny,
      thresholdCny: threshold,
      refreshedAt,
      severity: isWarning ? "warning" : "healthy",
      statusLabel: isWarning ? "偏低" : "正常",
      message: null
    };
  });
  const totalCny = providers.reduce(
    (sum, provider) => sum + (Number.isFinite(provider.amountCny) ? provider.amountCny : 0),
    0
  );

  return {
    refreshedAt,
    thresholdCny: threshold,
    primaryProvider,
    totalCny,
    providers
  };
}

export function buildDemoHourlyUsage() {
  const now = new Date();
  now.setMinutes(0, 0, 0);
  const buckets = Array.from({ length: 12 }, (_, index) => {
    const startedAt = new Date(now.getTime() - (11 - index) * 60 * 60 * 1000);
    const amountCny = index === 0 ? 1.46 : index === 9 ? 0.01 : index === 10 ? 0.0 : 0.0;
    return {
      key: startedAt.toISOString(),
      startedAt: startedAt.toISOString(),
      label: startedAt.toLocaleString("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
      }),
      amountCny,
      tokens: null,
      samples: amountCny > 0 ? 2 : 1,
      providers:
        amountCny > 0
          ? [
              {
                id: index === 9 ? "deepseek" : "aliyun",
                name: index === 9 ? "DeepSeek" : "阿里云百炼",
                shortName: index === 9 ? "DeepSeek" : "阿里云",
                currency: "CNY",
                amount: amountCny,
                amountCny,
                samples: 1,
                tokens: null
              }
            ]
          : []
    };
  });

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    hours: 24,
    snapshotCount: 2025,
    coverageMinutes: 447,
    ignoredIncreases: 0,
    tokenTracking: "not_enabled",
    buckets,
    providers: [
      { id: "aliyun", name: "阿里云百炼", shortName: "阿里云", currency: "CNY" },
      { id: "deepseek", name: "DeepSeek", shortName: "DeepSeek", currency: "CNY" }
    ]
  };
}

export function buildDemoUsageEvents({ limit = 80, offset = 0 } = {}) {
  const events = timedEvents();
  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    total: events.length,
    limit,
    offset,
    events: events.slice(offset, offset + limit)
  };
}

export function buildDemoRecentUsage({ limit = 20 } = {}) {
  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    events: timedEvents().slice(0, limit)
  };
}

export function buildDemoUsageStats({ groupBy = "projectId" } = {}) {
  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    hours: 24,
    groupBy,
    groups: aggregateEvents(timedEvents(), groupBy)
  };
}

export function buildDemoUsageOverview() {
  const events = timedEvents();
  const totalTokens = events.reduce((sum, event) => sum + event.totalTokens, 0);
  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    hours: 24,
    filters: {},
    eventCount: events.length,
    failureCount: 0,
    failureRate: 0,
    averageTokens: Math.round(totalTokens / events.length),
    averageLatencyMs: Math.round(
      events.reduce((sum, event) => sum + event.durationMs, 0) / events.length
    ),
    topModel: { key: events[0].model, totalTokens: events[0].totalTokens, eventCount: 1 },
    topProject: { key: "class-teacher", totalTokens: 4120, eventCount: 2 },
    inputTokens: events.reduce((sum, event) => sum + event.promptTokens, 0),
    outputTokens: events.reduce((sum, event) => sum + event.completionTokens, 0),
    promptTokens: events.reduce((sum, event) => sum + event.promptTokens, 0),
    completionTokens: events.reduce((sum, event) => sum + event.completionTokens, 0),
    cachedTokens: 0,
    reasoningTokens: 0,
    totalTokens,
    estimatedCost: round(events.reduce((sum, event) => sum + event.estimatedCost, 0)),
    currency: "CNY"
  };
}

export function buildDemoUsageTimeline() {
  const buckets = timedEvents()
    .slice()
    .reverse()
    .map((event) => ({
      key: event.createdAt,
      startedAt: event.createdAt,
      eventCount: 1,
      failureCount: 0,
      inputTokens: event.promptTokens,
      outputTokens: event.completionTokens,
      promptTokens: event.promptTokens,
      completionTokens: event.completionTokens,
      cachedTokens: 0,
      reasoningTokens: event.reasoningTokens,
      totalTokens: event.totalTokens,
      estimatedCost: event.estimatedCost,
      currency: "CNY",
      failureRate: 0
    }));

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    hours: 24,
    filters: {},
    bucket: "hour",
    buckets
  };
}

export function buildDemoUsageBreakdown({ groupBy = "projectId" } = {}) {
  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    hours: 24,
    filters: {},
    groupBy,
    groups: aggregateEvents(timedEvents(), groupBy)
  };
}

function timedEvents() {
  const now = new Date();
  return DEMO_EVENTS.map((event, index) => {
    const createdAt = new Date(now.getTime() - index * 42 * 60 * 1000).toISOString();
    return {
      id: event.requestId,
      createdAt,
      startedAt: createdAt,
      latencyMs: event.durationMs,
      inputTokens: event.promptTokens,
      outputTokens: event.completionTokens,
      userHash: null,
      sessionId: null,
      upstreamRequestId: null,
      mode: "report-only",
      ...event
    };
  });
}

function aggregateEvents(events, groupBy) {
  const groups = new Map();
  for (const event of events) {
    const key = event[groupBy] || "未标记";
    const group = groups.get(key) || {
      key,
      label: key,
      eventCount: 0,
      failureCount: 0,
      inputTokens: 0,
      outputTokens: 0,
      promptTokens: 0,
      completionTokens: 0,
      cachedTokens: 0,
      reasoningTokens: 0,
      totalTokens: 0,
      estimatedCost: 0,
      currency: "CNY"
    };
    group.eventCount += 1;
    group.inputTokens += event.promptTokens;
    group.outputTokens += event.completionTokens;
    group.promptTokens += event.promptTokens;
    group.completionTokens += event.completionTokens;
    group.reasoningTokens += event.reasoningTokens;
    group.totalTokens += event.totalTokens;
    group.estimatedCost = round(group.estimatedCost + event.estimatedCost);
    group.failureRate = 0;
    groups.set(key, group);
  }
  return Array.from(groups.values()).sort((left, right) => right.totalTokens - left.totalTokens);
}

function isLowBalanceDemo() {
  return String(process.env.TOKEN_MONITOR_DEMO_VARIANT || "").toLowerCase() === "low";
}

function round(value) {
  return Math.round(value * 1_000_000) / 1_000_000;
}
