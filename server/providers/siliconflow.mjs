import {
  missingConfig,
  normalizeCurrency,
  parseAmount,
  readJsonResponse
} from "./shared.mjs";

export async function fetchSiliconFlowBalance() {
  const apiKey = process.env.SILICONFLOW_API_KEY;
  const baseUrl = (process.env.SILICONFLOW_BASE_URL || "https://api.siliconflow.com").replace(
    /\/$/,
    ""
  );
  if (!apiKey) {
    return missingConfig("硅基流动", ["SILICONFLOW_API_KEY"]);
  }

  const response = await fetch(`${baseUrl}/v1/user/info`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${apiKey}`
    }
  });
  const body = await readJsonResponse(response);

  if (body?.status === false || (body?.code !== undefined && Number(body.code) !== 20000)) {
    const error = new Error(body?.message || "硅基流动用户信息接口返回失败");
    error.raw = body;
    throw error;
  }

  const data = body?.data || {};
  const amount = parseAmount(data.totalBalance ?? data.balance);
  if (amount === null) {
    const error = new Error("硅基流动返回中没有可识别的余额");
    error.raw = body;
    throw error;
  }

  const currency = normalizeCurrency(data.currency);
  return {
    status: "ok",
    amount,
    currency,
    message: data.status === "normal" ? "账户状态正常" : `账户状态：${data.status || "未知"}`,
    metrics: [
      {
        label: "赠送余额",
        value: parseAmount(data.balance),
        currency
      },
      {
        label: "充值余额",
        value: parseAmount(data.chargeBalance),
        currency
      }
    ],
    raw: body
  };
}
