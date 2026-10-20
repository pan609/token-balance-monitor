import { createHash, timingSafeEqual } from "node:crypto";

const LOOPBACK_ADDRESSES = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

function digest(value) {
  return createHash("sha256").update(value).digest();
}

function policiesFromEnv(env) {
  let value;
  try {
    value = JSON.parse(env.USAGE_READ_TOKENS || "null");
  } catch {
    throw new Error("Invalid usage read authentication configuration");
  }
  if (!value || Array.isArray(value) || typeof value !== "object" || !Object.keys(value).length) {
    throw new Error("Usage read authentication requires scoped credentials");
  }
  const existing = [env.USAGE_INGEST_TOKEN, env.TBM_INGEST_TOKEN, env.MOBILE_API_TOKEN,
    env.QUOTA_INGEST_TOKEN, env.QUOTA_READ_TOKEN].filter(Boolean);
  const seen = new Set(existing);
  return Object.values(value).map((policy) => {
    if (!policy || typeof policy.token !== "string" || !/^[A-Za-z0-9_-]{32,256}$/.test(policy.token) ||
        seen.has(policy.token) ||
        typeof policy.projectId !== "string" || !policy.projectId.trim() ||
        policy.projectId !== policy.projectId.trim() || policy.projectId.includes("*") ||
        !Array.isArray(policy.environments) || !policy.environments.length ||
        policy.environments.some((item) => typeof item !== "string" ||
          !item.trim() || item !== item.trim() || item.includes("*"))) {
      throw new Error("Invalid or reused usage read authentication credential");
    }
    seen.add(policy.token);
    return { tokenDigest: digest(policy.token), projectId: policy.projectId,
      environments: new Set(policy.environments) };
  });
}

export function createUsageReadGuard(env = process.env) {
  if (env.USAGE_READ_AUTH_REQUIRED && !["true", "false"].includes(env.USAGE_READ_AUTH_REQUIRED)) {
    throw new Error("Invalid usage read authentication mode");
  }
  if (env.USAGE_READ_AUTH_REQUIRED !== "true") return (_req, _res, next) => next();
  // Validate once at startup; never silently serve anonymous data after a bad config.
  const policies = policiesFromEnv(env);
  const requireHttps = env.USAGE_READ_REQUIRE_HTTPS !== "false";
  return (req, res, next) => {
    if (!["GET", "HEAD"].includes(req.method)) return next();
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    res.vary("Authorization");
    const forwardedHttps = LOOPBACK_ADDRESSES.has(req.socket?.remoteAddress) &&
      req.get("x-forwarded-proto") === "https";
    if (requireHttps && !req.secure && !forwardedHttps) {
      return res.status(426).json({ ok: false, message: "HTTPS is required for usage queries" });
    }
    const authorization = req.get("authorization") || "";
    const match = authorization.length <= 512 && /^Bearer ([^\s]+)$/i.exec(authorization);
    const requestedDigest = digest(match ? match[1] : "");
    let matched;
    for (const policy of policies) {
      if (timingSafeEqual(policy.tokenDigest, requestedDigest)) matched = policy;
    }
    if (!matched) {
      res.setHeader("WWW-Authenticate", "Bearer");
      return res.status(401).json({ ok: false, message: "Unauthorized usage query" });
    }
    // Legacy aggregate routes do not all support tenant filters. Scoped readers
    // may only list events with explicit, scalar project and environment filters.
    if (!/^\/events\/?$/i.test(req.path) ||
        typeof req.query.projectId !== "string" || req.query.projectId !== matched.projectId ||
        typeof req.query.environment !== "string" || !matched.environments.has(req.query.environment)) {
      return res.status(403).json({ ok: false, message: "Usage query outside credential scope" });
    }
    return next();
  };
}
