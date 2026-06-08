import crypto from "node:crypto";

export function missingConfig(providerName, envNames) {
  return {
    status: "not_configured",
    amount: null,
    currency: "CNY",
    message: `${providerName} 尚未配置`,
    details: `请在 .env 中填写：${envNames.join(", ")}`
  };
}

export function parseAmount(value) {
  if (value === null || value === undefined || value === "") return null;
  const amount = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(amount) ? amount : null;
}

export function normalizeCurrency(value, fallback = "CNY") {
  return String(value || fallback).trim().toUpperCase();
}

export function hmacSha256(key, content, encoding = "hex") {
  const hmac = crypto.createHmac("sha256", key).update(content, "utf8");
  return encoding ? hmac.digest(encoding) : hmac.digest();
}

export function sha256Hex(content) {
  return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}

export async function readJsonResponse(response) {
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { rawText: text };
  }

  if (!response.ok) {
    const message =
      body?.message ||
      body?.Message ||
      body?.error?.message ||
      body?.ResponseMetadata?.Error?.Message ||
      `HTTP ${response.status}`;
    const error = new Error(message);
    error.raw = body;
    throw error;
  }

  return body;
}
