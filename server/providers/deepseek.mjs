import { missingConfig, parseAmount, readJsonResponse } from "./shared.mjs";

export async function fetchDeepSeekBalance() {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return missingConfig("DeepSeek", ["DEEPSEEK_API_KEY"]);
  }

  const response = await fetch("https://api.deepseek.com/user/balance", {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${apiKey}`
    }
  });
  const body = await readJsonResponse(response);
  const cnyInfo =
    body?.balance_infos?.find((item) => item.currency === "CNY") ||
    body?.balance_infos?.[0];

  const amount = parseAmount(cnyInfo?.total_balance);
  if (amount === null) {
    const error = new Error("DeepSeek 返回中没有可识别的余额");
    error.raw = body;
    throw error;
  }

  return {
    status: "ok",
    amount,
    currency: cnyInfo.currency || "CNY",
    message: body?.is_available ? "账户可正常调用 API" : "账户余额不足或暂不可用",
    metrics: [
      {
        label: "赠金余额",
        value: parseAmount(cnyInfo.granted_balance),
        currency: cnyInfo.currency || "CNY"
      },
      {
        label: "充值余额",
        value: parseAmount(cnyInfo.topped_up_balance),
        currency: cnyInfo.currency || "CNY"
      }
    ],
    raw: body
  };
}
