#!/usr/bin/env bash
set -euo pipefail

LABEL="com.ysjblog.devdiary.background"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LAUNCHER="$ROOT_DIR/scripts/devdiary-background-launcher.sh"
LINK_DIR="$HOME/Library/LaunchAgents"
PLIST_DIR="$ROOT_DIR/.launchagents"
PLIST_PATH="$PLIST_DIR/$LABEL.plist"
PLIST_LINK="$LINK_DIR/$LABEL.plist"
APP_DATA_DIR="$HOME/Library/Application Support/DevDiary"
LOG_DIR="$APP_DATA_DIR/logs"
DOMAIN="gui/$(id -u)"

usage() {
  echo "Usage: $0 install|uninstall|status|run-now|print-plist" >&2
}

write_plist() {
  mkdir -p "$PLIST_DIR" "$LINK_DIR" "$LOG_DIR"
  cat > "$PLIST_PATH" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$LAUNCHER</string>
    <string>run</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ProcessType</key>
  <string>Background</string>
  <key>WorkingDirectory</key>
  <string>$ROOT_DIR</string>
  <key>StandardOutPath</key>
  <string>$LOG_DIR/background-runner.out.log</string>
  <key>StandardErrorPath</key>
  <string>$LOG_DIR/background-runner.err.log</string>
</dict>
</plist>
PLIST
  chmod 600 "$PLIST_PATH"
  plutil -lint "$PLIST_PATH" >/dev/null
  rm -f "$PLIST_LINK"
  ln -s "$PLIST_PATH" "$PLIST_LINK"
}

case "${1:-}" in
  install)
    if [[ ! -x "$LAUNCHER" ]]; then
      chmod +x "$LAUNCHER"
    fi
    write_plist
    launchctl bootout "$DOMAIN" "$PLIST_LINK" >/dev/null 2>&1 || true
    launchctl bootstrap "$DOMAIN" "$PLIST_LINK"
    launchctl enable "$DOMAIN/$LABEL"
    launchctl kickstart -k "$DOMAIN/$LABEL" >/dev/null 2>&1 || true
    echo "Installed $LABEL at $PLIST_LINK -> $PLIST_PATH"
    ;;
  uninstall)
    launchctl bootout "$DOMAIN" "$PLIST_LINK" >/dev/null 2>&1 || true
    rm -f "$PLIST_LINK" "$PLIST_PATH"
    echo "Uninstalled $LABEL"
    ;;
  status)
    launchctl print "$DOMAIN/$LABEL"
    ;;
  run-now)
    exec /bin/bash "$LAUNCHER" once
    ;;
  print-plist)
    write_plist
    cat "$PLIST_PATH"
    ;;
  *)
    usage
    exit 64
    ;;
esac
