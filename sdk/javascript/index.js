export class TokenBalanceMonitor {
  constructor(options = {}) {
    if (!options.endpoint) {
      throw new Error("TokenBalanceMonitor endpoint is required");
    }

    this.endpoint = options.endpoint;
    this.token = options.token || "";
    this.projectId = options.projectId || "default";
    this.environment = options.environment || "production";
    this.defaultAccountId = options.accountId || "default";
    this.defaultAccountName = options.accountName || "";
    this.defaultActorId = options.actorId || "";
    this.defaultActorName = options.actorName || "";
    this.defaultFeature = options.feature || "default";
    this.defaultOperationName = options.operationName || "";
    this.defaultResourceType = options.resourceType || "";
    this.maxQueueSize = options.maxQueueSize || 1000;
    this.batchSize = options.batchSize || 20;
    this.flushIntervalMs = options.flushIntervalMs || 5000;
    this.fetchImpl = options.fetch || globalThis.fetch;
    this.queue = [];
    this.timer = null;

    if (typeof this.fetchImpl !== "function") {
      throw new Error("TokenBalanceMonitor requires fetch");
    }
  }

  report(event = {}) {
    const normalized = {
      ...event,
      projectId: event.projectId || this.projectId,
      environment: event.environment || this.environment,
      accountId: event.accountId || this.defaultAccountId,
      accountName: event.accountName || this.defaultAccountName || undefined,
      actorId: event.actorId || event.userId || this.defaultActorId || undefined,
      actorName: event.actorName || event.userLabel || this.defaultActorName || undefined,
      feature: event.feature || this.defaultFeature,
      operationName: event.operationName || event.featureLabel || this.defaultOperationName || undefined,
      resourceType: event.resourceType || this.defaultResourceType || undefined,
      mode: event.mode || "report-only"
    };

    this.queue.push(normalized);
    if (this.queue.length > this.maxQueueSize) {
      this.queue.splice(0, this.queue.length - this.maxQueueSize);
    }
    this.scheduleFlush();
  }

  async flush() {
    if (!this.queue.length) return { ok: true, accepted: 0 };

    const events = this.queue.splice(0, this.batchSize);
    try {
      const response = await this.fetchImpl(this.endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(this.token ? { authorization: `Bearer ${this.token}` } : {})
        },
        body: JSON.stringify({ events })
      });

      if (!response.ok) {
        this.requeue(events);
        return { ok: false, status: response.status };
      }

      return await response.json();
    } catch (error) {
      this.requeue(events);
      return { ok: false, error };
    }
  }

  scheduleFlush() {
    if (this.timer) return;
    this.timer = setTimeout(async () => {
      this.timer = null;
      await this.flush();
      if (this.queue.length) this.scheduleFlush();
    }, this.flushIntervalMs);
    if (typeof this.timer.unref === "function") {
      this.timer.unref();
    }
  }

  requeue(events) {
    this.queue.unshift(...events);
    if (this.queue.length > this.maxQueueSize) {
      this.queue.length = this.maxQueueSize;
    }
  }
}

export function usageFromOpenAICompatible(response = {}) {
  const usage = response.usage || {};
  const promptTokens = usage.prompt_tokens ?? usage.input_tokens ?? usage.promptTokens;
  const completionTokens = usage.completion_tokens ?? usage.output_tokens ?? usage.completionTokens;
  return {
    promptTokens,
    completionTokens,
    inputTokens: promptTokens,
    outputTokens: completionTokens,
    totalTokens: usage.total_tokens ?? usage.totalTokens,
    cachedTokens: usage.cached_tokens ?? usage.cachedTokens,
    reasoningTokens: usage.reasoning_tokens ?? usage.reasoningTokens
  };
}
