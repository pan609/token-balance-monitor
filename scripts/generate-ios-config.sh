#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"
CONFIG_FILE="$ROOT_DIR/ios/TokenBalanceMonitor/Shared/TokenMonitorConfig.swift"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "缺少 .env，无法生成 iOS 配置" >&2
  exit 1
fi

read_env() {
  local key="$1"
  local override="${!key-}"
  if [[ -n "$override" ]]; then
    printf '%s' "$override"
    return 0
  fi

  local line
  line="$(grep -E "^${key}=" "$ENV_FILE" | tail -n 1 || true)"
  if [[ -z "$line" ]]; then
    return 0
  fi
  local value="${line#*=}"
  value="${value%$'\r'}"
  value="${value%\"}"
  value="${value#\"}"
  value="${value%\'}"
  value="${value#\'}"
  printf '%s' "$value"
}

escape_swift_string() {
  node -e 'let input=""; process.stdin.setEncoding("utf8"); process.stdin.on("data", chunk => input += chunk); process.stdin.on("end", () => process.stdout.write(JSON.stringify(input)));'
}

MOBILE_TOKEN="$(read_env MOBILE_API_TOKEN)"
API_URL="$(read_env MOBILE_API_URL)"
if [[ -z "$API_URL" ]]; then
  API_URL="http://127.0.0.1:5173/api/mobile/summary"
fi
QUOTA_API_URL="$(read_env QUOTA_API_URL)"
if [[ -z "$QUOTA_API_URL" ]]; then
  QUOTA_API_URL="${API_URL%/api/mobile/summary}/api/quota/summary"
fi
QUOTA_REFRESH_URL="$(read_env QUOTA_REFRESH_URL)"
if [[ -z "$QUOTA_REFRESH_URL" ]]; then
  if [[ "$QUOTA_API_URL" == */api/quota/summary ]]; then
    QUOTA_REFRESH_URL="${QUOTA_API_URL%/api/quota/summary}/api/quota/refresh"
  else
    QUOTA_REFRESH_URL="${QUOTA_API_URL%/}/refresh"
  fi
fi
QUOTA_TOKEN="$(read_env QUOTA_READ_TOKEN)"
if [[ -z "$QUOTA_TOKEN" ]]; then
  QUOTA_TOKEN="$MOBILE_TOKEN"
fi

if [[ -z "$MOBILE_TOKEN" ]]; then
  echo "缺少 MOBILE_API_TOKEN，无法生成 iOS 配置" >&2
  exit 1
fi

mkdir -p "$(dirname "$CONFIG_FILE")"
cat > "$CONFIG_FILE" <<EOF_CONFIG
enum TokenMonitorConfig {
    static let mobileSummaryURL = $(printf '%s' "$API_URL" | escape_swift_string)
    static let mobileToken = $(printf '%s' "$MOBILE_TOKEN" | escape_swift_string)
    static let quotaSummaryURL = $(printf '%s' "$QUOTA_API_URL" | escape_swift_string)
    static let quotaRefreshURL = $(printf '%s' "$QUOTA_REFRESH_URL" | escape_swift_string)
    static let quotaToken = $(printf '%s' "$QUOTA_TOKEN" | escape_swift_string)
}
EOF_CONFIG

echo "已生成 iOS 本地配置：$CONFIG_FILE"
