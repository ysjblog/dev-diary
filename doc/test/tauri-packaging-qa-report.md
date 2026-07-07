# Tauri Packaging QA Report

> Date: 2026-07-01
> Branch: feature/core-engine

## Scope

- Tauri macOS shell scaffold.
- Unsigned `.app` and `.dmg` packaging.
- Packaged app Core lifecycle smoke.

## Evidence

- `cargo check` passed for `src-tauri`.
- `npm test` passed for UI API helpers.
- `npm run package:mac` produced:
  - `src-tauri/target/release/bundle/macos/DevDiary.app` (`125M`)
  - `src-tauri/target/release/bundle/dmg/DevDiary_0.1.0_aarch64.dmg` (`54M`)
- Packaged launch smoke:
  - Opened `DevDiary.app`.
  - `GET http://127.0.0.1:4317/api/health` returned `200`.
  - API contract version was `4`.
  - Runtime host was `127.0.0.1`, port `4317`.
- Packaged shutdown smoke:
  - Quit `DevDiary.app`.
  - `lsof -nP -iTCP:4317 -sTCP:LISTEN` returned no listener after shutdown.

## Notes

- v1 unsigned package uses bundled Core source + bundled `core/node_modules`.
- Packaged Core currently requires Homebrew `node@22` at `/opt/homebrew/opt/node@22/bin/node` because `better-sqlite3` is a native module built for Node ABI 127.
- Core launch logs are written to `~/Library/Application Support/DevDiary/core-tauri.log`.
- Fully self-contained Node/native sidecar packaging remains a future hardening item.
