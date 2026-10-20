import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { createUsageReadGuard } from "./usage-read-auth.mjs";

const token = "test-only-query-secret-00000000000000000001";
const ingest = "test-only-write-secret-00000000000000000001";

test("real HTTP routes enforce scoped read auth without granting writes", async () => {
  const app = express();
  app.use("/api/usage", createUsageReadGuard({ USAGE_READ_AUTH_REQUIRED: "true",
    USAGE_INGEST_TOKEN: ingest, USAGE_READ_TOKENS: JSON.stringify({ dashboard: {
      token, projectId: "class-teacher", environments: ["staging"] } }) }));
  app.get("/api/usage/events", (req, res) => res.json({ ok: true, events: [], total: 0,
    project: req.query.projectId, environment: req.query.environment }));
  app.get("/api/usage/stats", (_req, res) => res.json({ unsafe: "unscoped" }));
  app.post("/api/usage/events", (req, res) => res.status(req.get("authorization") === `Bearer ${ingest}` ? 202 : 401).end());
  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const query = "?projectId=class-teacher&environment=staging";
  const readHeaders = { authorization: `Bearer ${token}`, "x-forwarded-proto": "https" };
  try {
    for (const path of ["/api/usage/events", "/API/USAGE/EVENTS", "/api/usage/events/"]) {
      assert.equal((await fetch(origin + path + query, { headers: { "x-forwarded-proto": "https" } })).status, 401);
      assert.equal((await fetch(origin + path + query, { headers: readHeaders })).status, 200);
      assert.equal((await fetch(origin + path + query, { method: "HEAD", headers: readHeaders })).status, 200);
    }
    for (const suffix of ["", "?projectId=other&environment=staging", query + "&projectId=other",
      query + "&environment=production", "?projectId=class-teacher&environment=production"]) {
      assert.equal((await fetch(origin + "/api/usage/events" + suffix, { headers: readHeaders })).status, 403);
    }
    assert.equal((await fetch(origin + "/api/usage/stats" + query, { headers: readHeaders })).status, 403);
    assert.equal((await fetch(origin + "/api/usage/events" + query, {
      headers: { authorization: `Bearer ${ingest}`, "x-forwarded-proto": "https" } })).status, 401);
    assert.equal((await fetch(origin + "/api/usage/events" + query, {
      headers: { authorization: `Bearer ${token}` } })).status, 426);
    assert.equal((await fetch(origin + "/api/usage/events", { method: "POST", headers: readHeaders })).status, 401);
    assert.equal((await fetch(origin + "/api/usage/events", { method: "POST", headers: { authorization: `Bearer ${ingest}` } })).status, 202);
    assert.equal((await fetch(origin + "/api/health")).status, 200);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
