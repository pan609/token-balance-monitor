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
NPM_CLI="$ROOT_DIR/.tools/npm/bin/npm-cli.js"

if [[ ! -f "$NPM_CLI" ]]; then
  mkdir -p "$ROOT_DIR/.tools/npm"
  curl -sL https://registry.npmjs.org/npm/latest -o "$ROOT_DIR/.tools/npm-latest.json"
  NPM_TARBALL="$("$NODE_BIN" -e "const fs=require('fs'); const data=JSON.parse(fs.readFileSync('.tools/npm-latest.json','utf8')); console.log(data.dist.tarball)")"
  curl -sL "$NPM_TARBALL" -o "$ROOT_DIR/.tools/npm.tgz"
  tar -xzf "$ROOT_DIR/.tools/npm.tgz" -C "$ROOT_DIR/.tools/npm" --strip-components=1
fi

PATH="$NODE_DIR:$PATH" "$NODE_BIN" "$NPM_CLI" install
