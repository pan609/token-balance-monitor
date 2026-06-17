import { fetchAliyunBalance } from "./aliyun.mjs";
import { fetchDeepSeekBalance } from "./deepseek.mjs";
import { fetchMoonshotBalance } from "./moonshot.mjs";
import { fetchOpenRouterCredits } from "./openrouter.mjs";
import { fetchSiliconFlowBalance } from "./siliconflow.mjs";
import { fetchVolcengineBalance } from "./volcengine.mjs";
import { buildDemoBalances, isDemoMode } from "../demo-data.mjs";

const providers = [
  {
    id: "aliyun",
    name: "阿里云百炼",
    shortName: "阿里云",
    accent: "#ff6a00",
    docsUrl:
      "https://help.aliyun.com/zh/user-center/developer-reference/api-bssopenapi-2017-12-14-queryaccountbalance/",
    consoleUrl: "https://billing-cost.console.aliyun.com/fortune/billing-account",
    fetcher: fetchAliyunBalance
  },
  {
    id: "moonshot",
    name: "Kimi / Moonshot",
    shortName: "Kimi",
    accent: "#7c3aed",
    docsUrl: "https://platform.kimi.com/docs/api/balance",
    consoleUrl: "https://platform.kimi.com/console",
    fetcher: fetchMoonshotBalance
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    shortName: "DeepSeek",
    accent: "#111827",
    docsUrl: "https://api-docs.deepseek.com/api/deepseek-api/user-balance",
    consoleUrl: "https://platform.deepseek.com/usage",
    fetcher: fetchDeepSeekBalance
  },
  {
    id: "siliconflow",
    name: "SiliconFlow / 硅基流动",
    shortName: "硅基流动",
    accent: "#059669",
    docsUrl: "https://docs.siliconflow.com/en/api-reference/userinfo/get-user-info",
    consoleUrl: "https://cloud.siliconflow.cn/account/ak",
    fetcher: fetchSiliconFlowBalance
  },
  {
    id: "volcengine",
    name: "火山引擎 / 豆包",
    shortName: "豆包",
    accent: "#2f6bff",
    docsUrl: "https://www.volcengine.com/docs/6269/1223898",
    consoleUrl: "https://console.volcengine.com/finance/account-overview",
    fetcher: fetchVolcengineBalance
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    shortName: "Router",
    accent: "#0f766e",
    docsUrl: "https://openrouter.ai/docs/api-reference/get-credits",
    consoleUrl: "https://openrouter.ai/settings/credits",
    fetcher: fetchOpenRouterCredits
  }
];

export async function fetchAllBalances() {
  if (isDemoMode()) {
    return buildDemoBalances();
  }

  const threshold = Number(process.env.LOW_BALANCE_THRESHOLD_CNY || 20);
  const refreshedAt = new Date().toISOString();

  const results = await Promise.all(
    providers.map(async (provider) => {
      const base = {
        id: provider.id,
        name: provider.name,
        shortName: provider.shortName,
        accent: provider.accent,
        docsUrl: provider.docsUrl,
        consoleUrl: provider.consoleUrl
      };

      try {
        const data = await provider.fetcher();
        return decorateStatus({
          ...base,
          ...data,
          thresholdCny: threshold,
          refreshedAt
        });
      } catch (error) {
        return decorateStatus({
          ...base,
          status: "error",
          amount: null,
          currency: "CNY",
          thresholdCny: threshold,
          refreshedAt,
          message: error.message || "获取失败",
          details: error.details || null,
          raw: error.raw || null
        });
      }
    })
  );

  const availableResults = results.filter(
    (result) => result.status === "ok" && Number.isFinite(result.amount)
  );
  const totalCny = availableResults.reduce((sum, result) => {
    if (Number.isFinite(result.amountCny)) return sum + result.amountCny;
    if (String(result.currency || "CNY").toUpperCase() === "CNY") return sum + result.amount;
    return sum;
  }, 0);

  return {
    refreshedAt,
    thresholdCny: threshold,
    primaryProvider: resolvePrimaryProviderId(results),
    totalCny,
    providers: results
  };
}

export function isKnownProviderId(providerId) {
  return providers.some((provider) => provider.id === providerId);
}

function resolvePrimaryProviderId(results) {
  const requested = String(process.env.PRIMARY_PROVIDER_ID || "aliyun").trim();
  if (results.some((result) => result.id === requested)) return requested;
  return "aliyun";
}

function decorateStatus(result) {
  if (result.status === "not_configured") {
    return {
      ...result,
      severity: "neutral",
      statusLabel: "待配置"
    };
  }

  if (result.status === "error") {
    return {
      ...result,
      severity: "danger",
      statusLabel: "异常"
    };
  }

  const comparableAmount = Number.isFinite(result.amountCny) ? result.amountCny : result.amount;
  const isCnyComparable =
    Number.isFinite(result.amountCny) ||
    String(result.currency || "CNY").toUpperCase() === "CNY";

  if (isCnyComparable && Number(comparableAmount) <= Number(result.thresholdCny)) {
    return {
      ...result,
      severity: "warning",
      statusLabel: "偏低"
    };
  }

  return {
    ...result,
    severity: "healthy",
    statusLabel: "正常"
  };
}
