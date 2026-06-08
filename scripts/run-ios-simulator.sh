#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT_DIR="$ROOT_DIR/ios/TokenBalanceMonitor"
DEVICE_NAME="${IOS_DEVICE_NAME:-iPhone 16 Pro}"
SIM_UDID="${IOS_SIM_UDID:-}"
BUNDLE_ID="${IOS_BUNDLE_ID:-com.panyue.TokenBalanceMonitor}"

if [[ -z "$SIM_UDID" ]]; then
  SIM_UDID="$(
    xcrun simctl list devices available --json |
      python3 -c '
import json
import sys

target = sys.argv[1]
devices = json.load(sys.stdin)["devices"]
for runtime_devices in devices.values():
    for device in runtime_devices:
        if device.get("name") == target and device.get("isAvailable"):
            print(device["udid"])
            raise SystemExit(0)
raise SystemExit(f"没有找到可用模拟器：{target}")
      ' "$DEVICE_NAME"
  )"
fi

"$ROOT_DIR/scripts/generate-ios-config.sh"
xcodegen generate --spec "$PROJECT_DIR/project.yml" --project "$PROJECT_DIR"

while read -r OTHER_UDID; do
  if [[ -z "$OTHER_UDID" || "$OTHER_UDID" == "$SIM_UDID" ]]; then
    continue
  fi

  if xcrun simctl listapps "$OTHER_UDID" 2>/dev/null | grep -q "$BUNDLE_ID"; then
    echo "关闭同项目的其它模拟器：$OTHER_UDID"
    xcrun simctl terminate "$OTHER_UDID" "$BUNDLE_ID" 2>/dev/null || true
    xcrun simctl shutdown "$OTHER_UDID" 2>/dev/null || true
  fi
done < <(
  xcrun simctl list devices booted --json |
    python3 -c '
import json
import sys

devices = json.load(sys.stdin)["devices"]
for runtime_devices in devices.values():
    for device in runtime_devices:
        if device.get("state") == "Booted":
            print(device["udid"])
    '
)

xcrun simctl boot "$SIM_UDID" 2>/dev/null || true
xcrun simctl bootstatus "$SIM_UDID" -b

xcodebuild \
  -project "$PROJECT_DIR/TokenBalanceMonitor.xcodeproj" \
  -scheme TokenBalanceMonitor \
  -destination "platform=iOS Simulator,id=$SIM_UDID" \
  -derivedDataPath "$PROJECT_DIR/DerivedData" \
  -quiet \
  build

APP_PATH="$PROJECT_DIR/DerivedData/Build/Products/Debug-iphonesimulator/TokenBalanceMonitor.app"
xcrun simctl terminate "$SIM_UDID" "$BUNDLE_ID" 2>/dev/null || true
xcrun simctl install "$SIM_UDID" "$APP_PATH"
xcrun simctl launch "$SIM_UDID" "$BUNDLE_ID"

echo "已启动 iOS 余额监控：$DEVICE_NAME / $SIM_UDID"
