#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
IOS_DIR="$ROOT_DIR/ios/TokenBalanceMonitor"
PROJECT_PATH="$IOS_DIR/TokenBalanceMonitor.xcodeproj"
DERIVED_DATA="$IOS_DIR/DerivedDataWatch"
APP_PATH="$DERIVED_DATA/Build/Products/Debug-watchsimulator/TokenBalanceWatch.app"
BUNDLE_ID="com.panyue.TokenBalanceMonitor.watch"

WATCH_SIM_UDID="${WATCH_SIM_UDID:-}"

find_booted_watch() {
  xcrun simctl list devices booted 2>/dev/null |
    grep "Apple Watch" |
    sed -E 's/.*\(([0-9A-Fa-f-]{36})\).*/\1/' |
    head -n 1
}

find_available_watch() {
  xcrun simctl list devices available 2>/dev/null |
    grep "Apple Watch" |
    sed -E 's/.*\(([0-9A-Fa-f-]{36})\).*/\1/' |
    head -n 1
}

if [[ -z "$WATCH_SIM_UDID" ]]; then
  WATCH_SIM_UDID="$(find_booted_watch || true)"
fi

if [[ -z "$WATCH_SIM_UDID" ]]; then
  WATCH_SIM_UDID="$(find_available_watch || true)"
fi

if [[ -z "$WATCH_SIM_UDID" ]]; then
  cat >&2 <<'EOF'
没有找到可用 Apple Watch Simulator。
请先在 Xcode > Settings > Platforms 下载 watchOS Simulator runtime。
EOF
  exit 1
fi

"$ROOT_DIR/scripts/generate-ios-config.sh"

(
  cd "$IOS_DIR"
  xcodegen generate
  xcodebuild \
    -project "$PROJECT_PATH" \
    -scheme TokenBalanceWatch \
    -configuration Debug \
    -destination "id=$WATCH_SIM_UDID" \
    -derivedDataPath "$DERIVED_DATA" \
    CODE_SIGNING_ALLOWED=NO \
    build
)

xcrun simctl boot "$WATCH_SIM_UDID" >/dev/null 2>&1 || true
open -a Simulator --args -CurrentDeviceUDID "$WATCH_SIM_UDID" >/dev/null 2>&1 || true
xcrun simctl install "$WATCH_SIM_UDID" "$APP_PATH"
xcrun simctl launch "$WATCH_SIM_UDID" "$BUNDLE_ID"

echo "已启动 Apple Watch 额度监控：$WATCH_SIM_UDID"
