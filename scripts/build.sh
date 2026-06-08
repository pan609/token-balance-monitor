#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
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

if [[ ! -f "$ROOT_DIR/.tools/npm/bin/npm-cli.js" || ! -d "$ROOT_DIR/node_modules" ]]; then
  "$ROOT_DIR/scripts/install-deps.sh"
fi

PATH="$NODE_DIR:$PATH" "$NODE_BIN" "$ROOT_DIR/.tools/npm/bin/npm-cli.js" run build
