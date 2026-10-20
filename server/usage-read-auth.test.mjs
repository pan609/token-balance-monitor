import assert from "node:assert/strict";
import test from "node:test";
import { createUsageReadGuard } from "./usage-read-auth.mjs";

const READ = "test-only-read-credential-0000000000000001";
const INGEST = "test-only-ingest-credential-00000000000001";
const MOBILE = "test-only-mobile-credential-00000000000001";
const env = (policies = { dashboard: { token: READ, projectId: "class-teacher", environments: ["staging"] } }) => ({
  USAGE_READ_AUTH_REQUIRED: "true", USAGE_INGEST_TOKEN: INGEST, MOBILE_API_TOKEN: MOBILE,
  USAGE_READ_TOKENS: JSON.stringify(policies)
});

function request(guard, changes = {}) {
  const headers = { authorization: `Bearer ${READ}`, ...changes.headers };
  const req = { method: "GET", path: "/events", secure: true,
    socket: { remoteAddress: "203.0.113.10" },
    query: { projectId: "class-teacher", environment: "staging" }, ...changes,
    get: (name) => headers[name.toLowerCase()] };
  const result = { passed: false, headers: {}, status: 200 };
  const res = { setHeader: (name, value) => { result.headers[name] = value; },
    vary: (value) => { result.vary = value; },
    status: (value) => { result.status = value; return res; },
    json: (value) => { result.body = value; return res; } };
  guard(req, res, () => { result.passed = true; });
  return result;
}

test("explicit opt-in preserves existing local behavior", () => {
  assert.equal(request(createUsageReadGuard({}), { headers: { authorization: "" } }).passed, true);
});

test("required auth fails closed at startup for missing or malformed policies", () => {
  assert.throws(() => createUsageReadGuard({ USAGE_READ_AUTH_REQUIRED: "True" }));
  for (const value of [undefined, "{broken", "null", "[]", "{}"])
    assert.throws(() => createUsageReadGuard({ USAGE_READ_AUTH_REQUIRED: "true", USAGE_READ_TOKENS: value }));
});

test("read credentials cannot reuse write, mobile, quota or another reader token", () => {
  for (const token of [INGEST, MOBILE, "short"])
    assert.throws(() => createUsageReadGuard(env({ x: { token, projectId: "class-teacher", environments: ["staging"] } })));
  assert.throws(() => createUsageReadGuard({ ...env(), QUOTA_READ_TOKEN: READ }));
  assert.throws(() => createUsageReadGuard({ ...env(), QUOTA_INGEST_TOKEN: READ }));
  assert.throws(() => createUsageReadGuard(env({ a: { token: READ, projectId: "a", environments: ["staging"] },
    b: { token: READ, projectId: "b", environments: ["staging"] } })));
});

test("scopes cannot be empty or wildcard", () => {
  for (const projectId of ["", " ", "*", "class-teacher "])
    assert.throws(() => createUsageReadGuard(env({ x: { token: READ, projectId, environments: ["staging"] } })));
  for (const environments of [[], [""], ["*"], [null], "staging"])
    assert.throws(() => createUsageReadGuard(env({ x: { token: READ, projectId: "class-teacher", environments } })));
});

test("only the dedicated read credential authorizes query", () => {
  const guard = createUsageReadGuard(env());
  for (const token of ["", "wrong", INGEST, MOBILE]) {
    const r = request(guard, { headers: { authorization: token ? `Bearer ${token}` : "" } });
    assert.equal(r.status, 401); assert.equal(r.passed, false);
    assert.equal(r.headers["Cache-Control"], "private, no-store, max-age=0");
    assert.equal(r.vary, "Authorization");
  }
  assert.equal(request(guard).passed, true);
  assert.equal(request(guard, { method: "HEAD" }).passed, true);
});

test("project/environment are required scalar filters, including duplicate query rejection", () => {
  const guard = createUsageReadGuard(env());
  for (const query of [{}, { projectId: "other", environment: "staging" },
    { projectId: "class-teacher", environment: "production" },
    { projectId: ["class-teacher", "other"], environment: "staging" },
    { projectId: "class-teacher", environment: ["staging", "production"] }]) {
    assert.equal(request(guard, { query }).status, 403);
  }
});

test("scoped reader cannot access legacy unscoped aggregation endpoints", () => {
  const guard = createUsageReadGuard(env());
  for (const path of ["/recent", "/stats", "/overview", "/hourly", "/timeline", "/breakdown"])
    assert.equal(request(guard, { path }).status, 403);
  assert.equal(request(guard, { path: "/EVENTS/" }).passed, true);
});

test("HTTP is rejected and only loopback proxy can assert TLS", () => {
  const guard = createUsageReadGuard(env());
  assert.equal(request(guard, { secure: false }).status, 426);
  assert.equal(request(guard, { secure: false, headers: { "x-forwarded-proto": "https" } }).status, 426);
  assert.equal(request(guard, { secure: false, socket: { remoteAddress: "127.0.0.1" },
    headers: { "x-forwarded-proto": "https" } }).passed, true);
  assert.equal(request(guard, { secure: false, socket: { remoteAddress: "127.0.0.1" },
    headers: { "x-forwarded-proto": "https,http" } }).status, 426);
});

test("writes and preflight continue to existing independent ingest authorization", () => {
  const guard = createUsageReadGuard(env());
  for (const method of ["POST", "OPTIONS", "PUT", "DELETE"])
    assert.equal(request(guard, { method }).passed, true);
});

test("malformed and oversized authorization never become query credentials", () => {
  const guard = createUsageReadGuard(env());
  for (const authorization of [READ, `Bearer ${READ} extra`, `Bearer ${"x".repeat(600)}`])
    assert.equal(request(guard, { headers: { authorization } }).status, 401);
});
