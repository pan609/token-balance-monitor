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
  python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))'
}

MOBILE_TOKEN="$(read_env MOBILE_API_TOKEN)"
API_URL="$(read_env MOBILE_API_URL)"
if [[ -z "$API_URL" ]]; then
  API_URL="http://127.0.0.1:5173/api/mobile/summary"
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
}
EOF_CONFIG

echo "已生成 iOS 本地配置：$CONFIG_FILE"
