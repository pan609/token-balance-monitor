#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT_DIR="$ROOT_DIR/ios/TokenBalanceMonitor"
BUNDLE_ID="${IOS_BUNDLE_ID:-com.panyue.TokenBalanceMonitor}"
DEVICE_ID="${IOS_DEVICE_ID:-}"
TEAM_ID="${IOS_DEVELOPMENT_TEAM:-}"
DERIVED_DATA_PATH="$PROJECT_DIR/DerivedDataDevice"

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

find_connected_device() {
  xcrun devicectl list devices 2>/dev/null |
    awk 'NR > 2 && $0 ~ /connected/ { print $3; exit }'
}

if [[ -z "$DEVICE_ID" ]]; then
  DEVICE_ID="$(find_connected_device || true)"
fi

if [[ -z "$DEVICE_ID" ]]; then
  echo "没有找到 connected 状态的 iPhone。请用 USB 连接并在手机上信任这台 Mac。" >&2
  exit 1
fi

"$ROOT_DIR/scripts/generate-ios-config.sh"
"$(find_xcodegen)" generate --spec "$PROJECT_DIR/project.yml" --project "$PROJECT_DIR"

BUILD_SETTINGS=()
if [[ -n "$TEAM_ID" ]]; then
  BUILD_SETTINGS+=("DEVELOPMENT_TEAM=$TEAM_ID" "CODE_SIGN_STYLE=Automatic")
fi

xcodebuild \
  -project "$PROJECT_DIR/TokenBalanceMonitor.xcodeproj" \
  -scheme TokenBalanceMonitor \
  -configuration Debug \
  -sdk iphoneos \
  -destination "generic/platform=iOS" \
  -derivedDataPath "$DERIVED_DATA_PATH" \
  -allowProvisioningUpdates \
  -allowProvisioningDeviceRegistration \
  "${BUILD_SETTINGS[@]}" \
  build

APP_PATH="$DERIVED_DATA_PATH/Build/Products/Debug-iphoneos/TokenBalanceMonitor.app"
xcrun devicectl device install app --device "$DEVICE_ID" "$APP_PATH"
xcrun devicectl device process launch --device "$DEVICE_ID" --terminate-existing "$BUNDLE_ID"

echo "已安装并启动真机 App：$DEVICE_ID"
