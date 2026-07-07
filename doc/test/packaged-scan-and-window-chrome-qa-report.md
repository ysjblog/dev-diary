# QA Black-Box Report

- Environment: Local macOS packaged `DevDiary.app` plus Vite localhost RWD check
- Revision / HEAD SHA: feature/core-engine working tree after startup auto-scan/window chrome fix
- Timestamp: 2026-07-01 12:59 Asia/Taipei
- Target URL / public entry: `src-tauri/target/release/bundle/macos/DevDiary.app`, `http://127.0.0.1:5174/`
- Test depth: Level 3
- Subagent attempt: Not available in current tool surface
- Subagents used: none
- Fallback reason: Performed black-box scenarios manually through packaged local API and Playwright browser checks
- Result: PASS

## Scenarios

- [PASS] Launch packaged app, wait for Core, then request `GET /api/health`.
  Expected: Core responds on loopback with service `devdiary-core`.
  Actual: HTTP 200, contract version 4, runtime port 4317.
- [PASS] Exercise the Dashboard load path before scan.
  Expected: `GET /api/dashboard` responds quickly.
  Actual: completed in 0 wall-clock seconds.
- [PASS] Exercise the update-log path through `POST /api/scan?range=24h`.
  Expected: HTTP 200 and no wedged Core API after scan.
  Actual: HTTP 200 in 14.18 seconds; scanned 18 projects; subsequent Dashboard request completed in 0 seconds.
- [PASS] Launch packaged app without manually starting Core.
  Expected: app-owned Core process starts and serves the local API.
  Actual: `GET /api/health` returned HTTP 200, contract version 4, 12 capabilities, runtime port 4317, pid 21381.
- [PASS] Verify Settings API startup recovery.
  Expected: Settings does not remain on `Settings API 發生錯誤 / Load failed` and shows persisted roots.
  Actual: Settings displayed Core runtime connected, contract v4, persisted roots `~/Projects` and `~/Workspace/side-projects`; no `Load failed` text.
- [PASS] Verify UI startup auto scan.
  Expected: with persisted project roots and connected Core, the UI triggers one global startup scan.
  Actual: Playwright/Chrome observed `POST http://127.0.0.1:5174/api/scan?range=all`; page had no Core load-failed text.
- [PASS] Verify desktop viewport visual shell.
  Expected: no fake traffic-light controls, no horizontal overflow, no Core API error banner.
  Actual: `.window-controls,.control-dot` count was 0; `scrollWidth=clientWidth=1440`; no Core API error text.
- [PASS] Click the visible `更新日誌` button in the UI.
  Expected: scan completes and no Core API error remains visible.
  Actual: UI showed `掃描完成`; no Core API error text; fake control count 0.
- [PASS] Verify mobile-width viewport visual shell.
  Expected: no fake traffic-light controls, no horizontal overflow, no Core API error banner.
  Actual: `.window-controls,.control-dot` count was 0; `scrollWidth=clientWidth=390`; no Core API error text.

## Evidence

- Screenshots:
  - `/tmp/codex-ui-shot-df89aa9b86f2.png`
  - `/tmp/devdiary-rwd-desktop.png`
  - `/tmp/devdiary-rwd-mobile.png`
  - `/tmp/devdiary-click-update.png`
  - `/tmp/devdiary-startup-auto-scan-desktop.png`
  - `/tmp/devdiary-startup-auto-scan-mobile.png`
  - `/tmp/devdiary-settings-connected.png`
- Commands / artifacts:
  - `npm test`
  - `cd core && npm test`
  - `cd core && npm run typecheck`
  - `npm run build`
  - `npm run package:mac`
  - `curl http://127.0.0.1:4317/api/health`
  - `curl -X POST http://127.0.0.1:4317/api/scan?range=24h`
  - Packaged `.app` launch smoke via `open -n src-tauri/target/release/bundle/macos/DevDiary.app`
  - Playwright with local Google Chrome executable against `http://127.0.0.1:5174/`
- Console errors: 0
- Network/API errors: 0 during final smoke

## Findings

- Severity: none
- Reproduction steps: none
- Expected: no findings
- Actual: no findings

## Residual Risk

- Packaged app still relies on local Homebrew `node@22` for the bundled Core runtime, matching the current packaging delta.
- macOS may ask the user for Desktop-folder access when scanning projects under Desktop; this is an OS privacy prompt and was not auto-approved during QA.
