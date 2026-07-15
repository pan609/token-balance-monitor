#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT_DIR="$ROOT_DIR/ios/TokenBalanceMonitor"
BUNDLE_ID="${WATCH_BUNDLE_ID:-com.panyue.TokenBalanceMonitor.watch}"
DEVICE_ID="${WATCH_DEVICE_ID:-}"
TEAM_ID="${IOS_DEVELOPMENT_TEAM:-${WATCH_DEVELOPMENT_TEAM:-}}"
DERIVED_DATA_PATH="$PROJECT_DIR/DerivedDataWatchDevice"

find_xcodegen() {
  for candidate in \
    "$ROOT_DIR/.tools/bin/xcodegen" \
    "/opt/homebrew/bin/xcodegen" \
    "/usr/local/bin/xcodegen" \
    "$(command -v xcodegen 2>/dev/null || true)"
  do
    if [[ -n "$candidate" && -x "$candidate" ]]; then
      echo "$candidate"
      return 0
    fi
  done
  echo "缺少 xcodegen，请先安装：brew install xcodegen" >&2
  return 1
}

find_connected_watch() {
  xcrun devicectl list devices 2>/dev/null |
    perl -ne 'if (/available \(paired\)/ && /Apple\s+Watch/ && /([A-F0-9]{8}(?:-[A-F0-9]{4}){3}-[A-F0-9]{12})/i) { print "$1\n"; exit }'
}

if [[ -z "$DEVICE_ID" ]]; then
  DEVICE_ID="$(find_connected_watch || true)"
fi

if [[ -z "$DEVICE_ID" ]]; then
  echo "没有找到 available 状态的 Apple Watch。请确认手表已解锁、靠近 iPhone，并在 Xcode Devices 中可见。" >&2
  exit 1
fi

"$ROOT_DIR/scripts/generate-ios-config.sh"
"$(find_xcodegen)" generate --spec "$PROJECT_DIR/project.yml" --project "$PROJECT_DIR"

XCODEBUILD_ARGS=(
  -project "$PROJECT_DIR/TokenBalanceMonitor.xcodeproj"
  -target TokenBalanceWatch
  -configuration Debug
  -sdk watchos
  -destination "generic/platform=watchOS"
  -allowProvisioningUpdates
  -allowProvisioningDeviceRegistration
  "CONFIGURATION_BUILD_DIR=$DERIVED_DATA_PATH/Build/Products/Debug-watchos"
  "SYMROOT=$DERIVED_DATA_PATH/Build/Products"
)
if [[ -n "$TEAM_ID" ]]; then
  XCODEBUILD_ARGS+=("DEVELOPMENT_TEAM=$TEAM_ID" "CODE_SIGN_STYLE=Automatic")
fi

xcodebuild "${XCODEBUILD_ARGS[@]}" build

APP_PATH="$DERIVED_DATA_PATH/Build/Products/Debug-watchos/TokenBalanceWatch.app"
xcrun devicectl device install app --device "$DEVICE_ID" "$APP_PATH"
xcrun devicectl device process launch --device "$DEVICE_ID" --terminate-existing "$BUNDLE_ID"

echo "已安装并启动 Apple Watch App：$DEVICE_ID"
