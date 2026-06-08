import { missingConfig, normalizeCurrency, parseAmount, readJsonResponse } from "./shared.mjs";

export async function fetchOpenRouterCredits() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return missingConfig("OpenRouter", ["OPENROUTER_API_KEY"]);
  }

  const response = await fetch("https://openrouter.ai/api/v1/credits", {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${apiKey}`
    }
  });
  const body = await readJsonResponse(response);
  const data = body?.data || {};
  const totalCredits = parseAmount(data.total_credits);
  const totalUsage = parseAmount(data.total_usage);

  if (totalCredits === null || totalUsage === null) {
    const error = new Error("OpenRouter 返回中没有可识别的 credits 数据");
    error.raw = body;
    throw error;
  }

  const amount = totalCredits - totalUsage;
  return {
    status: "ok",
    amount,
    currency: normalizeCurrency(data.currency, "USD"),
    message: "剩余 credits 已同步",
    metrics: [
      {
        label: "已购买 credits",
        value: totalCredits,
        currency: "USD"
      },
      {
        label: "已使用 credits",
        value: totalUsage,
        currency: "USD"
      }
    ],
    raw: body
  };
}
