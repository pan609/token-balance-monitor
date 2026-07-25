import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BRIDGE_PATH = path.join(__dirname, "..", "codex-quota-bridge.mjs");
const LOCK_PATH = path.join(__dirname, "..", "..", "data", ".codex-quota-refresh-lock");
const DEFAULT_MIN_INTERVAL_MS = 20000;

export function triggerCodexQuotaRefresh({ minIntervalMs = getMinIntervalMs() } = {}) {
  if (!shouldRun(minIntervalMs)) return false;

  const child = spawn(process.execPath, [BRIDGE_PATH], {
    detached: true,
    stdio: "ignore",
    env: process.env
  });
  child.unref();
  return true;
}

function shouldRun(minIntervalMs) {
  let last = NaN;
  try {
    last = Number(readFileSync(LOCK_PATH, "utf8"));
  } catch {
    // no lock file yet
  }
  if (Number.isFinite(last) && Date.now() - last < minIntervalMs) return false;

  try {
    mkdirSync(path.dirname(LOCK_PATH), { recursive: true });
    writeFileSync(LOCK_PATH, String(Date.now()));
  } catch {
    // best-effort debounce; worst case we just refresh a bit more often
  }
  return true;
}

function getMinIntervalMs() {
  return Number(process.env.CODEX_QUOTA_REFRESH_DEBOUNCE_MS || DEFAULT_MIN_INTERVAL_MS);
}
