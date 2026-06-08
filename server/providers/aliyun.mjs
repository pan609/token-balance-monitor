import { createHmac, randomUUID } from "node:crypto";
import { missingConfig, parseAmount, readJsonResponse } from "./shared.mjs";

const endpoint = "https://business.aliyuncs.com/";

export async function fetchAliyunBalance() {
  const accessKeyId = process.env.ALIYUN_ACCESS_KEY_ID;
  const accessKeySecret = process.env.ALIYUN_ACCESS_KEY_SECRET;
  if (!accessKeyId || !accessKeySecret) {
    return missingConfig("阿里云", [
      "ALIYUN_ACCESS_KEY_ID",
      "ALIYUN_ACCESS_KEY_SECRET"
    ]);
  }

  const params = {
    Action: "QueryAccountBalance",
    Version: "2017-12-14",
    Format: "JSON",
    AccessKeyId: accessKeyId,
    SignatureMethod: "HMAC-SHA1",
    SignatureVersion: "1.0",
    SignatureNonce: randomUUID(),
    Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, "Z")
  };
  params.Signature = signAliyunRpc("GET", params, accessKeySecret);

  const url = `${endpoint}?${toQueryString(params)}`;
  const body = await readJsonResponse(await fetch(url));

  if (String(body?.Code) !== "200" || body?.Success === false) {
    const error = new Error(body?.Message || "阿里云余额接口返回失败");
    error.raw = body;
    throw error;
  }

  const data = body?.Data || {};
  const amount = parseAmount(data.AvailableAmount);
  if (amount === null) {
    const error = new Error("阿里云返回中没有可识别的可用额度");
    error.raw = body;
    throw error;
  }

  return {
    status: "ok",
    amount,
    currency: data.Currency || "CNY",
    message: "费用中心余额已同步",
    metrics: [
      {
        label: "现金余额",
        value: parseAmount(data.AvailableCashAmount),
        currency: data.Currency || "CNY"
      },
      {
        label: "信控额度",
        value: parseAmount(data.CreditAmount),
        currency: data.Currency || "CNY"
      },
      {
        label: "网商银行额度",
        value: parseAmount(data.MybankCreditAmount),
        currency: data.Currency || "CNY"
      }
    ],
    raw: body
  };
}

function signAliyunRpc(method, params, accessKeySecret) {
  const canonicalizedQueryString = Object.keys(params)
    .sort()
    .map((key) => `${percentEncode(key)}=${percentEncode(params[key])}`)
    .join("&");
  const stringToSign = `${method}&${percentEncode("/")}&${percentEncode(
    canonicalizedQueryString
  )}`;

  return createHmac("sha1", `${accessKeySecret}&`)
    .update(stringToSign, "utf8")
    .digest("base64");
}

function toQueryString(params) {
  return Object.keys(params)
    .sort()
    .map((key) => `${percentEncode(key)}=${percentEncode(params[key])}`)
    .join("&");
}

function percentEncode(value) {
  return encodeURIComponent(String(value))
    .replace(/!/g, "%21")
    .replace(/'/g, "%27")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29")
    .replace(/\*/g, "%2A");
}
