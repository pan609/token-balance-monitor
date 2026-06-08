#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

find_node() {
  for candidate in \
    "${TOKEN_MONITOR_NODE:-}" \
    "/opt/homebrew/bin/node" \
    "/Applications/Codex.app/Contents/Resources/node" \
    "$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node" \
    "$(command -v node 2>/dev/null || true)"
  do
    if [[ -n "$candidate" && -x "$candidate" ]]; then
      echo "$candidate"
      return 0
    fi
  done
  return 1
}

NODE_BIN="$(find_node)"
NODE_DIR="$(dirname "$NODE_BIN")"

if [[ ! -d "$ROOT_DIR/node_modules" || ! -f "$ROOT_DIR/.tools/npm/bin/npm-cli.js" ]]; then
  "$ROOT_DIR/scripts/install-deps.sh"
fi

if [[ ! -x "$ROOT_DIR/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron" ]]; then
  PATH="$NODE_DIR:$PATH" "$NODE_BIN" "$ROOT_DIR/node_modules/electron/install.js"
fi

echo "启动余额监控桌宠..."
PATH="$NODE_DIR:$PATH" "$NODE_BIN" "$ROOT_DIR/.tools/npm/bin/npm-cli.js" run pet
