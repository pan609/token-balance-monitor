import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const DEFAULT_RETENTION_DAYS = 30;
const DEFAULT_RECENT_LIMIT = 50;
const MAX_BATCH_SIZE = 100;
const MAX_METADATA_KEYS = 24;
const MAX_ATTRIBUTE_KEYS = 48;
const MAX_LIST_LIMIT = 500;

let usageDir = null;
let eventsPath = null;

export function initUsageEventStore(rootDir) {
  usageDir = process.env.USAGE_EVENTS_DIR
    ? path.resolve(rootDir, process.env.USAGE_EVENTS_DIR)
    : path.join(rootDir, "data");
  eventsPath = path.join(usageDir, "usage-events.jsonl");
  fs.mkdirSync(usageDir, { recursive: true });
}

export function recordUsageEvents(payload, { ingestTokenId = null } = {}) {
  if (!eventsPath || isUsageEventsDisabled()) {
    return { accepted: 0, rejected: 0, errors: ["Usage event storage is disabled"] };
  }

  const rawEvents = normalizePayload(payload);
  const limitedEvents = rawEvents.slice(0, MAX_BATCH_SIZE);
  const accepted = [];
  const errors = [];

  for (const [index, rawEvent] of limitedEvents.entries()) {
    try {
      accepted.push(normalizeEvent(rawEvent, { ingestTokenId }));
    } catch (error) {
      errors.push({ index, message: error.message });
    }
  }

  if (accepted.length) {
    fs.appendFileSync(
      eventsPath,
      accepted.map((event) => JSON.stringify(event)).join("\n") + "\n",
      "utf8"
    );
    compactUsageEventsIfNeeded();
  }

  return {
    accepted: accepted.length,
    rejected: rawEvents.length - accepted.length,
    truncated: rawEvents.length > MAX_BATCH_SIZE,
    errors
  };
}

export function listRecentUsageEvents({ limit = DEFAULT_RECENT_LIMIT } = {}) {
  const normalizedLimit = Math.max(1, Math.min(Number(limit) || DEFAULT_RECENT_LIMIT, 200));
  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    events: readUsageEvents()
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
      .slice(0, normalizedLimit)
      .map(publicEvent)
  };
}

export function listUsageEvents(query = {}) {
  const limit = Math.max(1, Math.min(Number(query.limit) || 50, MAX_LIST_LIMIT));
  const offset = Math.max(0, Number(query.offset) || 0);
  const filtered = getFilteredUsageEvents(query).sort(
    (left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt)
  );

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    total: filtered.length,
    limit,
    offset,
    events: filtered.slice(offset, offset + limit).map(publicEvent)
  };
}

export function buildUsageOverview(query = {}) {
  const events = getFilteredUsageEvents(query);
  const totals = buildTotals(events);
  const failureCount = events.filter((event) => event.status === "error").length;
  const latencies = events
    .map((event) => event.latencyMs)
    .filter((value) => Number.isFinite(value));
  const averageLatencyMs = latencies.length
    ? Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length)
    : null;
  const topModel = topGroup(events, "model");
  const topProject = topGroup(events, "projectId");

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    ...buildQueryMeta(query),
    eventCount: events.length,
    failureCount,
    failureRate: events.length ? roundNumber(failureCount / events.length) : 0,
    averageTokens: events.length ? Math.round(totals.totalTokens / events.length) : 0,
    averageLatencyMs,
    topModel,
    topProject,
    ...totals
  };
}

export function buildUsageTimeline(query = {}) {
  const events = getFilteredUsageEvents(query);
  const bucketMs = normalizeBucketMs(query.bucket);
  const buckets = new Map();

  for (const event of events) {
    const timestamp = Date.parse(event.createdAt);
    if (!Number.isFinite(timestamp)) continue;
    const startedAt = new Date(Math.floor(timestamp / bucketMs) * bucketMs);
    const key = startedAt.toISOString();
    if (!buckets.has(key)) {
      buckets.set(key, {
        key,
        startedAt: key,
        eventCount: 0,
        failureCount: 0,
        inputTokens: 0,
        outputTokens: 0,
        cachedTokens: 0,
        reasoningTokens: 0,
        totalTokens: 0,
        estimatedCost: 0,
        currency: event.currency || "CNY"
      });
    }

    addEventToAggregate(buckets.get(key), event);
  }

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    ...buildQueryMeta(query),
    bucket: bucketMs === 60 * 60 * 1000 ? "hour" : "day",
    buckets: Array.from(buckets.values())
      .sort((left, right) => Date.parse(left.startedAt) - Date.parse(right.startedAt))
      .map(roundAggregate)
  };
}

export function buildUsageStats({ hours = 24, groupBy = "provider" } = {}) {
  const normalizedHours = Math.max(1, Math.min(Number(hours) || 24, 24 * 90));
  const normalizedGroupBy = normalizeGroupBy(groupBy);
  const since = Date.now() - normalizedHours * 60 * 60 * 1000;
  const groups = new Map();

  for (const event of readUsageEvents({ since })) {
    const key = String(event[normalizedGroupBy] || "未标记");
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        label: key,
        eventCount: 0,
        failureCount: 0,
        successCount: 0,
        errorCount: 0,
        inputTokens: 0,
        outputTokens: 0,
        cachedTokens: 0,
        reasoningTokens: 0,
        totalTokens: 0,
        estimatedCost: 0,
        currency: event.currency || "CNY"
      });
    }

    const group = groups.get(key);
    addEventToAggregate(group, event);
    if (event.status === "error") group.errorCount += 1;
    else group.successCount += 1;
  }

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    hours: normalizedHours,
    groupBy: normalizedGroupBy,
    groups: Array.from(groups.values())
      .sort((left, right) => right.totalTokens - left.totalTokens)
      .map(roundAggregate)
  };
}

export function buildUsageBreakdown(query = {}) {
  const normalizedGroupBy = normalizeGroupBy(query.groupBy || "projectId");
  const groups = new Map();

  for (const event of getFilteredUsageEvents(query)) {
    const key = String(event[normalizedGroupBy] || "未标记");
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        label: key,
        eventCount: 0,
        failureCount: 0,
        inputTokens: 0,
        outputTokens: 0,
        cachedTokens: 0,
        reasoningTokens: 0,
        totalTokens: 0,
        estimatedCost: 0,
        currency: event.currency || "CNY"
      });
    }

    addEventToAggregate(groups.get(key), event);
  }

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    ...buildQueryMeta(query),
    groupBy: normalizedGroupBy,
    groups: Array.from(groups.values())
      .sort((left, right) => right.totalTokens - left.totalTokens)
      .map(roundAggregate)
  };
}

function normalizePayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.events)) return payload.events;
  return [payload];
}

function normalizeEvent(rawEvent, { ingestTokenId }) {
  if (!rawEvent || typeof rawEvent !== "object") {
    throw new Error("Event must be an object");
  }

  const provider = requiredString(rawEvent.provider, "provider");
  const model = requiredString(rawEvent.model, "model");
  const usage = rawEvent.usage || {};
  const promptTokens = numberOrZero(
    rawEvent.promptTokens ?? rawEvent.inputTokens ?? usage.prompt_tokens ?? usage.input_tokens
  );
  const completionTokens = numberOrZero(
    rawEvent.completionTokens ?? rawEvent.outputTokens ?? usage.completion_tokens ?? usage.output_tokens
  );
  const cachedTokens = numberOrZero(
    rawEvent.cachedTokens ?? usage.cached_tokens ?? usage.prompt_cache_hit_tokens
  );
  const reasoningTokens = numberOrZero(
    rawEvent.reasoningTokens ?? usage.reasoning_tokens
  );
  const totalTokens = numberOrZero(
    rawEvent.totalTokens ?? usage.total_tokens ?? promptTokens + completionTokens + reasoningTokens
  );

  const startedAt = parseDate(rawEvent.startedAt) || parseDate(rawEvent.createdAt) || new Date();
  const createdAt = parseDate(rawEvent.createdAt) || startedAt;
  const requestId = optionalString(rawEvent.requestId) || crypto.randomUUID();
  const metadata = sanitizeMetadata(rawEvent.metadata);
  const attributes = sanitizeAttributes(
    rawEvent.attributes ?? rawEvent.metadata?.usage_context ?? rawEvent.metadata?.attributes
  );
  const accountId = optionalString(rawEvent.accountId) || "default";
  const actorId = optionalString(rawEvent.actorId ?? rawEvent.userId);
  const feature = optionalString(rawEvent.feature) || "default";
  const userHash = optionalString(rawEvent.userHash) || hashUserId(actorId ?? rawEvent.userId);

  return {
    id: requestId,
    requestId,
    receivedAt: new Date().toISOString(),
    startedAt: startedAt.toISOString(),
    createdAt: createdAt.toISOString(),
    provider,
    model,
    projectId: optionalString(rawEvent.projectId) || "default",
    environment: optionalString(rawEvent.environment) || "production",
    accountId,
    accountName: optionalString(
      rawEvent.accountName ?? rawEvent.accountLabel ?? rawEvent.metadata?.labels?.account
    ),
    actorId,
    actorName: optionalString(
      rawEvent.actorName ?? rawEvent.userLabel ?? rawEvent.metadata?.labels?.user
    ),
    userHash,
    feature,
    operationName: optionalString(
      rawEvent.operationName ?? rawEvent.featureLabel ?? rawEvent.metadata?.labels?.feature
    ),
    resourceType: optionalString(rawEvent.resourceType),
    resourceId: optionalString(rawEvent.resourceId),
    resourceName: optionalString(rawEvent.resourceName),
    sessionId: optionalString(rawEvent.sessionId),
    upstreamRequestId: optionalString(rawEvent.upstreamRequestId),
    mode: optionalString(rawEvent.mode) || "report-only",
    status: optionalString(rawEvent.status) || "success",
    durationMs: numberOrNull(rawEvent.durationMs ?? rawEvent.latencyMs),
    latencyMs: numberOrNull(rawEvent.latencyMs ?? rawEvent.durationMs),
    promptTokens,
    completionTokens,
    inputTokens: promptTokens,
    outputTokens: completionTokens,
    cachedTokens,
    reasoningTokens,
    totalTokens,
    estimatedCost: numberOrZero(rawEvent.estimatedCost ?? rawEvent.cost),
    currency: optionalString(rawEvent.currency)?.toUpperCase() || "CNY",
    ingestTokenId,
    attributes,
    metadata,
    rawUsage: sanitizeJsonObject(rawEvent.rawUsage || usage)
  };
}

function readUsageEvents({ since = 0 } = {}) {
  if (!eventsPath || !fs.existsSync(eventsPath)) return [];

  const deduped = new Map();
  for (const line of fs.readFileSync(eventsPath, "utf8").split(/\r?\n/)) {
    if (!line) continue;
    try {
      const event = normalizeStoredEvent(JSON.parse(line));
      const createdAt = Date.parse(event.createdAt);
      if (!Number.isFinite(createdAt) || createdAt < since) continue;
      deduped.set(event.requestId || event.id || crypto.randomUUID(), event);
    } catch {
      // Ignore malformed historical rows instead of breaking the dashboard.
    }
  }

  return Array.from(deduped.values());
}

function getFilteredUsageEvents(query = {}) {
  const filters = normalizeFilters(query);
  return readUsageEvents({ since: filters.since }).filter((event) => {
    if (filters.until && Date.parse(event.createdAt) > filters.until) return false;
    if (filters.provider && event.provider !== filters.provider) return false;
    if (filters.model && event.model !== filters.model) return false;
    if (filters.projectId && event.projectId !== filters.projectId) return false;
    if (filters.environment && event.environment !== filters.environment) return false;
    if (filters.accountId && event.accountId !== filters.accountId) return false;
    if (filters.actorId && event.actorId !== filters.actorId) return false;
    if (filters.feature && event.feature !== filters.feature) return false;
    if (filters.resourceType && event.resourceType !== filters.resourceType) return false;
    if (filters.status && event.status !== filters.status) return false;
    if (filters.userHash && event.userHash !== filters.userHash) return false;
    if (filters.attributes.length && !attributesMatch(event.attributes, filters.attributes)) return false;
    if (filters.q && !eventMatchesSearch(event, filters.q)) return false;
    return true;
  });
}

function normalizeFilters(query = {}) {
  const hours = Math.max(1, Math.min(Number(query.hours) || 24, 24 * 365));
  const since = parseDate(query.since)?.getTime() || Date.now() - hours * 60 * 60 * 1000;
  const until = parseDate(query.until)?.getTime() || 0;

  return {
    hours,
    since,
    until,
    provider: optionalString(query.provider),
    model: optionalString(query.model),
    projectId: optionalString(query.projectId),
    environment: optionalString(query.environment),
    accountId: optionalString(query.accountId),
    actorId: optionalString(query.actorId),
    feature: optionalString(query.feature),
    resourceType: optionalString(query.resourceType),
    status: optionalString(query.status),
    userHash: optionalString(query.userHash),
    attributes: normalizeAttributeFilters(query),
    q: optionalString(query.q)?.toLowerCase()
  };
}

function eventMatchesSearch(event, query) {
  return [
    event.provider,
    event.model,
    event.projectId,
    event.environment,
    event.accountId,
    event.accountName,
    event.actorId,
    event.actorName,
    event.feature,
    event.operationName,
    event.resourceType,
    event.resourceId,
    event.resourceName,
    event.requestId,
    event.upstreamRequestId,
    event.userHash,
    ...Object.values(event.attributes || {}),
    ...Object.values(event.metadata || {})
  ]
    .filter((value) => value !== undefined && value !== null)
    .some((value) => String(value).toLowerCase().includes(query));
}

function buildTotals(events) {
  return events.reduce(
    (totals, event) => addEventToAggregate(totals, event),
    {
      inputTokens: 0,
      outputTokens: 0,
      cachedTokens: 0,
      reasoningTokens: 0,
      totalTokens: 0,
      estimatedCost: 0,
      currency: events[0]?.currency || "CNY"
    }
  );
}

function addEventToAggregate(aggregate, event) {
  aggregate.eventCount = (aggregate.eventCount || 0) + 1;
  if (event.status === "error") aggregate.failureCount = (aggregate.failureCount || 0) + 1;
  aggregate.inputTokens += event.inputTokens || 0;
  aggregate.outputTokens += event.outputTokens || 0;
  aggregate.promptTokens = (aggregate.promptTokens || 0) + (event.promptTokens || event.inputTokens || 0);
  aggregate.completionTokens =
    (aggregate.completionTokens || 0) + (event.completionTokens || event.outputTokens || 0);
  aggregate.cachedTokens += event.cachedTokens || 0;
  aggregate.reasoningTokens += event.reasoningTokens || 0;
  aggregate.totalTokens += event.totalTokens || 0;
  if (!aggregate.currency || event.currency === aggregate.currency) {
    aggregate.currency = aggregate.currency || event.currency || "CNY";
    aggregate.estimatedCost += event.estimatedCost || 0;
  }
  return aggregate;
}

function roundAggregate(aggregate) {
  return {
    ...aggregate,
    failureRate: aggregate.eventCount
      ? roundNumber((aggregate.failureCount || aggregate.errorCount || 0) / aggregate.eventCount)
      : 0,
    estimatedCost: roundNumber(aggregate.estimatedCost)
  };
}

function topGroup(events, key) {
  const groups = new Map();
  for (const event of events) {
    const value = event[key] || "未标记";
    const current = groups.get(value) || { key: value, totalTokens: 0, eventCount: 0 };
    current.totalTokens += event.totalTokens || 0;
    current.eventCount += 1;
    groups.set(value, current);
  }
  return Array.from(groups.values()).sort((left, right) => right.totalTokens - left.totalTokens)[0] || null;
}

function buildQueryMeta(query = {}) {
  const filters = normalizeFilters(query);
  return {
    hours: filters.hours,
    filters: Object.fromEntries(
      Object.entries(filters).filter(
        ([key, value]) => value && !["since", "until", "hours"].includes(key)
      )
    )
  };
}

function normalizeBucketMs(bucket) {
  return bucket === "day" ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000;
}

function compactUsageEventsIfNeeded() {
  const retentionDays = Number(process.env.USAGE_EVENTS_RETENTION_DAYS || DEFAULT_RETENTION_DAYS);
  const since = Date.now() - Math.max(1, retentionDays) * 24 * 60 * 60 * 1000;
  const events = readUsageEvents({ since });
  const content = events.map((event) => JSON.stringify(event)).join("\n");
  fs.writeFileSync(eventsPath, content ? `${content}\n` : "", "utf8");
}

function publicEvent(event) {
  return {
    id: event.id,
    startedAt: event.startedAt,
    createdAt: event.createdAt,
    provider: event.provider,
    model: event.model,
    projectId: event.projectId,
    environment: event.environment,
    accountId: event.accountId,
    accountName: event.accountName,
    actorId: event.actorId,
    actorName: event.actorName,
    userHash: event.userHash,
    feature: event.feature,
    operationName: event.operationName,
    resourceType: event.resourceType,
    resourceId: event.resourceId,
    resourceName: event.resourceName,
    sessionId: event.sessionId,
    requestId: event.requestId,
    upstreamRequestId: event.upstreamRequestId,
    mode: event.mode,
    status: event.status,
    durationMs: event.durationMs,
    latencyMs: event.latencyMs,
    promptTokens: event.promptTokens,
    completionTokens: event.completionTokens,
    inputTokens: event.inputTokens,
    outputTokens: event.outputTokens,
    cachedTokens: event.cachedTokens,
    reasoningTokens: event.reasoningTokens,
    totalTokens: event.totalTokens,
    estimatedCost: event.estimatedCost,
    currency: event.currency,
    attributes: event.attributes,
    metadata: event.metadata,
    rawUsage: event.rawUsage
  };
}

function sanitizeMetadata(metadata) {
  return sanitizeJsonObject(metadata, MAX_METADATA_KEYS);
}

function sanitizeAttributes(attributes) {
  return sanitizeJsonObject(attributes, MAX_ATTRIBUTE_KEYS);
}

function sanitizeJsonObject(metadata, maxKeys = MAX_METADATA_KEYS) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return {};

  return Object.fromEntries(
    Object.entries(metadata)
      .filter(([, value]) =>
        value === null ||
        ["string", "number", "boolean"].includes(typeof value) ||
        (typeof value === "object" && !Array.isArray(value))
      )
      .slice(0, maxKeys)
      .map(([key, value]) => [String(key).slice(0, 64), value])
  );
}

function normalizeStoredEvent(event) {
  const promptTokens = numberOrZero(event.promptTokens ?? event.inputTokens);
  const completionTokens = numberOrZero(event.completionTokens ?? event.outputTokens);
  const reasoningTokens = numberOrZero(event.reasoningTokens);
  const cachedTokens = numberOrZero(event.cachedTokens);
  const totalTokens = numberOrZero(
    event.totalTokens ?? promptTokens + completionTokens + reasoningTokens
  );
  const metadata = sanitizeMetadata(event.metadata);
  const attributes = sanitizeAttributes(
    event.attributes ?? event.metadata?.usage_context ?? event.metadata?.attributes
  );
  const actorId = optionalString(event.actorId ?? event.userId);

  return {
    ...event,
    startedAt: event.startedAt || event.createdAt || event.receivedAt,
    createdAt: event.createdAt || event.startedAt || event.receivedAt,
    accountId: optionalString(event.accountId) || "default",
    accountName: optionalString(
      event.accountName ?? event.accountLabel ?? event.metadata?.labels?.account
    ),
    actorId,
    actorName: optionalString(
      event.actorName ?? event.userLabel ?? event.metadata?.labels?.user
    ),
    feature: optionalString(event.feature) || "default",
    operationName: optionalString(
      event.operationName ?? event.featureLabel ?? event.metadata?.labels?.feature
    ),
    resourceType: optionalString(event.resourceType),
    resourceId: optionalString(event.resourceId),
    resourceName: optionalString(event.resourceName),
    durationMs: numberOrNull(event.durationMs ?? event.latencyMs),
    latencyMs: numberOrNull(event.latencyMs ?? event.durationMs),
    promptTokens,
    completionTokens,
    inputTokens: promptTokens,
    outputTokens: completionTokens,
    cachedTokens,
    reasoningTokens,
    totalTokens,
    userHash: optionalString(event.userHash) || hashUserId(actorId ?? event.userId),
    attributes,
    metadata,
    rawUsage: sanitizeJsonObject(event.rawUsage || event.usage || {})
  };
}

function normalizeAttributeFilters(query = {}) {
  const rawFilters = [];
  for (const [key, value] of Object.entries(query)) {
    if (key.startsWith("attributes.")) {
      rawFilters.push([key.slice("attributes.".length), value]);
    }
    if (key.startsWith("attr.")) {
      rawFilters.push([key.slice("attr.".length), value]);
    }
  }

  const attributeQuery = optionalString(query.attributes);
  if (attributeQuery) {
    for (const pair of attributeQuery.split(",")) {
      const [key, ...rest] = pair.split("=");
      const value = rest.join("=");
      if (key && value) rawFilters.push([key.trim(), value.trim()]);
    }
  }

  return rawFilters
    .map(([key, value]) => [optionalString(key), optionalString(value)])
    .filter(([key, value]) => key && value);
}

function attributesMatch(attributes = {}, filters = []) {
  return filters.every(([key, expected]) => {
    const actual = getNestedValue(attributes, key);
    if (actual === undefined || actual === null) return false;
    return String(actual) === String(expected);
  });
}

function getNestedValue(source, key) {
  return String(key)
    .split(".")
    .reduce((value, segment) => {
      if (!value || typeof value !== "object") return undefined;
      return value[segment];
    }, source);
}

function hashUserId(userId) {
  const normalized = optionalString(userId);
  if (!normalized) return null;
  const salt = process.env.USAGE_USER_HASH_SALT || process.env.USAGE_INGEST_TOKEN || "token-balance-monitor";
  return crypto.createHmac("sha256", salt).update(normalized).digest("hex").slice(0, 24);
}

function normalizeGroupBy(groupBy) {
  const allowed = new Set([
    "provider",
    "model",
    "projectId",
    "environment",
    "accountId",
    "actorId",
    "userHash",
    "feature",
    "resourceType"
  ]);
  return allowed.has(groupBy) ? groupBy : "provider";
}

function requiredString(value, name) {
  const normalized = optionalString(value);
  if (!normalized) throw new Error(`${name} is required`);
  return normalized;
}

function optionalString(value) {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized ? normalized.slice(0, 256) : null;
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function roundNumber(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 1_000_000) / 1_000_000;
}

function isUsageEventsDisabled() {
  return String(process.env.USAGE_EVENTS_ENABLED || "true").toLowerCase() === "false";
}
