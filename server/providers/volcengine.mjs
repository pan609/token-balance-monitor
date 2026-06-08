import { missingConfig, parseAmount, readJsonResponse } from "./shared.mjs";
import { hmacSha256, sha256Hex } from "./shared.mjs";

const host = "open.volcengineapi.com";
const service = "billing";

export async function fetchVolcengineBalance() {
  const accessKeyId = process.env.VOLCENGINE_ACCESS_KEY_ID;
  const secretAccessKey = process.env.VOLCENGINE_SECRET_ACCESS_KEY;
  const region = process.env.VOLCENGINE_REGION || "cn-beijing";
  if (!accessKeyId || !secretAccessKey) {
    return missingConfig("火山引擎", [
      "VOLCENGINE_ACCESS_KEY_ID",
      "VOLCENGINE_SECRET_ACCESS_KEY"
    ]);
  }

  const query = {
    Action: "QueryBalanceAcct",
    Version: "2022-01-01"
  };
  const payloadHash = sha256Hex("");
  const xDate = toVolcDate(new Date());
  const shortDate = xDate.slice(0, 8);
  const authorization = signVolcengineRequest({
    accessKeyId,
    secretAccessKey,
    region,
    xDate,
    shortDate,
    query,
    payloadHash
  });

  const url = `https://${host}/?${canonicalQueryString(query)}`;
  const response = await fetch(url, {
    headers: {
      Authorization: authorization,
      Host: host,
      "X-Date": xDate,
      "X-Content-Sha256": payloadHash
    }
  });
  const body = await readJsonResponse(response);

  if (body?.ResponseMetadata?.Error) {
    const error = new Error(
      body.ResponseMetadata.Error.Message ||
        body.ResponseMetadata.Error.Code ||
        "火山引擎余额接口返回失败"
    );
    error.raw = body;
    throw error;
  }

  const data = body?.Result || {};
  const amount = parseAmount(data.AvailableBalance);
  if (amount === null) {
    const error = new Error("火山引擎返回中没有可识别的可用余额");
    error.raw = body;
    throw error;
  }

  return {
    status: "ok",
    amount,
    currency: "CNY",
    message: "费用中心余额已同步",
    metrics: [
      {
        label: "现金余额",
        value: parseAmount(data.CashBalance),
        currency: "CNY"
      },
      {
        label: "信控额度",
        value: parseAmount(data.CreditLimit),
        currency: "CNY"
      },
      {
        label: "冻结金额",
        value: parseAmount(data.FreezeAmount),
        currency: "CNY"
      },
      {
        label: "欠费金额",
        value: parseAmount(data.ArrearsBalance),
        currency: "CNY"
      }
    ],
    raw: body
  };
}

function signVolcengineRequest({
  accessKeyId,
  secretAccessKey,
  region,
  xDate,
  shortDate,
  query,
  payloadHash
}) {
  const signedHeaders = "host;x-content-sha256;x-date";
  const canonicalHeaders = [
    `host:${host}`,
    `x-content-sha256:${payloadHash}`,
    `x-date:${xDate}`
  ].join("\n");
  const canonicalRequest = [
    "GET",
    "/",
    canonicalQueryString(query),
    `${canonicalHeaders}\n`,
    signedHeaders,
    payloadHash
  ].join("\n");

  const credentialScope = `${shortDate}/${region}/${service}/request`;
  const stringToSign = [
    "HMAC-SHA256",
    xDate,
    credentialScope,
    sha256Hex(canonicalRequest)
  ].join("\n");

  const signingKey = getVolcengineSigningKey(secretAccessKey, shortDate, region, service);
  const signature = hmacSha256(signingKey, stringToSign);

  return `HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
}

function getVolcengineSigningKey(secretAccessKey, shortDate, region, serviceName) {
  const dateKey = hmacSha256(secretAccessKey, shortDate, null);
  const regionKey = hmacSha256(dateKey, region, null);
  const serviceKey = hmacSha256(regionKey, serviceName, null);
  return hmacSha256(serviceKey, "request", null);
}

function canonicalQueryString(query) {
  return Object.keys(query)
    .sort()
    .map((key) => `${encodeRfc3986(key)}=${encodeRfc3986(query[key])}`)
    .join("&");
}

function encodeRfc3986(value) {
  return encodeURIComponent(String(value))
    .replace(/[!'()*]/g, (character) =>
      `%${character.charCodeAt(0).toString(16).toUpperCase()}`
    );
}

function toVolcDate(date) {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}
