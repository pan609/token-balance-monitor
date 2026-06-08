import {
  missingConfig,
  normalizeCurrency,
  parseAmount,
  readJsonResponse
} from "./shared.mjs";

export async function fetchMoonshotBalance() {
  const apiKey = process.env.MOONSHOT_API_KEY;
  if (!apiKey) {
    return missingConfig("Kimi / Moonshot", ["MOONSHOT_API_KEY"]);
  }

  const response = await fetch("https://api.moonshot.cn/v1/users/me/balance", {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${apiKey}`
    }
  });
  const body = await readJsonResponse(response);

  if (body?.status === false || body?.scode === "0x1") {
    const error = new Error(body?.message || body?.error?.message || "Kimi 余额接口返回失败");
    error.raw = body;
    throw error;
  }

  const data = body?.data || {};
  const amount = parseAmount(data.available_balance);
  if (amount === null) {
    const error = new Error("Kimi 返回中没有可识别的可用余额");
    error.raw = body;
    throw error;
  }

  const currency = normalizeCurrency(data.currency);
  return {
    status: "ok",
    amount,
    currency,
    message: "开放平台余额已同步",
    metrics: [
      {
        label: "代金券余额",
        value: parseAmount(data.voucher_balance),
        currency
      },
      {
        label: "现金余额",
        value: parseAmount(data.cash_balance),
        currency
      }
    ],
    raw: body
  };
}
