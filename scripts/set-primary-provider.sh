#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOCAL_ENV="$ROOT_DIR/.env"
REMOTE_HOST="${TOKEN_MONITOR_REMOTE_HOST:-}"
REMOTE_DIR="${TOKEN_MONITOR_REMOTE_DIR:-/home/admin/token-monitor}"

usage() {
  cat <<'EOF_USAGE'
用法：
  ./scripts/set-primary-provider.sh <平台>

平台可用：
  aliyun | 阿里云
  moonshot | kimi | Kimi
  deepseek | DeepSeek
  siliconflow | 硅基 | 硅基流动
  volcengine | doubao | 豆包 | 火山
  openrouter | router

默认会更新：
  - 本机 .env：给 macOS 桌宠/状态栏用

可选：
  --local-only   只改本机
  --remote-only  只改服务器
  --both         同时改本机和服务器

远程模式需要设置：
  TOKEN_MONITOR_REMOTE_HOST=user@example.com
  TOKEN_MONITOR_REMOTE_DIR=/home/user/token-monitor
EOF_USAGE
}

MODE="local"
PROVIDER_INPUT=""
for arg in "$@"; do
  case "$arg" in
    --local-only)
      MODE="local"
      ;;
    --remote-only)
      MODE="remote"
      ;;
    --both)
      MODE="both"
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      if [[ -z "$PROVIDER_INPUT" ]]; then
        PROVIDER_INPUT="$arg"
      else
        echo "多余参数：$arg" >&2
        usage >&2
        exit 1
      fi
      ;;
  esac
done

if [[ -z "$PROVIDER_INPUT" ]]; then
  usage >&2
  exit 1
fi

normalize_provider() {
  case "$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')" in
    aliyun|ali|阿里云|阿里|百炼)
      echo "aliyun"
      ;;
    moonshot|kimi|月之暗面)
      echo "moonshot"
      ;;
    deepseek|deep|ds)
      echo "deepseek"
      ;;
    siliconflow|silicon|硅基|硅基流动)
      echo "siliconflow"
      ;;
    volcengine|volc|doubao|豆包|火山|火山引擎)
      echo "volcengine"
      ;;
    openrouter|router)
      echo "openrouter"
      ;;
    *)
      echo ""
      ;;
  esac
}

PROVIDER_ID="$(normalize_provider "$PROVIDER_INPUT")"
if [[ -z "$PROVIDER_ID" ]]; then
  echo "不认识的平台：$PROVIDER_INPUT" >&2
  usage >&2
  exit 1
fi

set_env_value() {
  local env_file="$1"
  local value="$2"
  if [[ ! -f "$env_file" ]]; then
    echo "缺少配置文件：$env_file" >&2
    return 1
  fi

  if grep -q '^PRIMARY_PROVIDER_ID=' "$env_file"; then
    perl -0pi -e "s/^PRIMARY_PROVIDER_ID=.*/PRIMARY_PROVIDER_ID=$value/m" "$env_file"
  else
    printf '\nPRIMARY_PROVIDER_ID=%s\n' "$value" >> "$env_file"
  fi
}

if [[ "$MODE" == "both" || "$MODE" == "local" ]]; then
  set_env_value "$LOCAL_ENV" "$PROVIDER_ID"
  echo "本机重点关注已设置为：$PROVIDER_ID"
fi

if [[ "$MODE" == "both" || "$MODE" == "remote" ]]; then
  if [[ -z "$REMOTE_HOST" ]]; then
    echo "远程模式需要设置 TOKEN_MONITOR_REMOTE_HOST，例如 user@example.com" >&2
    exit 1
  fi

  ssh -o BatchMode=yes "$REMOTE_HOST" "
    set -e
    cd '$REMOTE_DIR'
    if grep -q '^PRIMARY_PROVIDER_ID=' .env; then
      perl -0pi -e 's/^PRIMARY_PROVIDER_ID=.*/PRIMARY_PROVIDER_ID=$PROVIDER_ID/m' .env
    else
      printf '\nPRIMARY_PROVIDER_ID=$PROVIDER_ID\n' >> .env
    fi
    if [ -f server.pid ] && kill -0 \$(cat server.pid) 2>/dev/null; then
      kill \$(cat server.pid)
      sleep 1
    fi
    nohup node server/index.mjs >/tmp/token-monitor-server.log 2>&1 &
    echo \$! > server.pid
    sleep 2
    curl -fsS http://127.0.0.1:5174/api/health >/dev/null
  "
  echo "服务器重点关注已设置为：$PROVIDER_ID"
fi

echo "完成。iPhone App 手动刷新后会看到新重点关注；小组件可能需要等 iOS 下次刷新。"
