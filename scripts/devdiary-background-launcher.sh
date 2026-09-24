#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CORE_DIR="$ROOT_DIR/core"
MODE="${1:-run}"
if [[ $# -gt 0 ]]; then
  shift
fi
APP_DATA_DIR="${HOME}/Library/Application Support/DevDiary"
LOG_DIR="$APP_DATA_DIR/logs"

if [[ "$MODE" != "run" && "$MODE" != "once" ]]; then
  echo "Usage: $0 [run|once]" >&2
  exit 64
fi

mkdir -p "$LOG_DIR"

export PATH="${HOME}/.local/bin:/opt/homebrew/opt/node@22/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:${PATH:-}"
export DEVDIARY_APP_RUNTIME="${DEVDIARY_APP_RUNTIME:-launchagent}"

NODE_BIN="${DEVDIARY_NODE_BIN:-}"
if [[ -z "$NODE_BIN" ]]; then
  BUNDLED_NODE="$CORE_DIR/node/bin/node"
  if [[ -x "$BUNDLED_NODE" ]]; then
    NODE_BIN="$BUNDLED_NODE"
  elif [[ -x "/opt/homebrew/opt/node@22/bin/node" ]]; then
    NODE_BIN="/opt/homebrew/opt/node@22/bin/node"
  else
    NODE_BIN="$(command -v node || true)"
  fi
fi

if [[ -z "$NODE_BIN" || ! -x "$NODE_BIN" ]]; then
  echo "Node.js executable was not found in the app bundle or supported fallback paths." >&2
  exit 69
fi

cd "$CORE_DIR"
exec "$NODE_BIN" ./node_modules/tsx/dist/cli.mjs src/backgroundRunner.ts "$MODE" "$@"
