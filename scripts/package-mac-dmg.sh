#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_PATH="$ROOT_DIR/src-tauri/target/release/bundle/macos/DevDiary.app"
DMG_DIR="$ROOT_DIR/src-tauri/target/release/bundle/dmg"
DMG_PATH="$DMG_DIR/DevDiary_0.1.0_aarch64.dmg"

if [[ ! -d "$APP_PATH" ]]; then
  echo "DevDiary.app was not found. Run: npm run package:mac" >&2
  exit 1
fi

mkdir -p "$DMG_DIR"
rm -f "$DMG_PATH"
rm -f "$ROOT_DIR"/src-tauri/target/release/bundle/macos/rw.*.DevDiary_0.1.0_aarch64.dmg

hdiutil create \
  -volname "DevDiary" \
  -srcfolder "$APP_PATH" \
  -ov \
  -format UDZO \
  "$DMG_PATH"

du -sh "$APP_PATH" "$DMG_PATH"
