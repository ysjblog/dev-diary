# QA Black-Box Report

- Environment: localhost Vite + loopback Core
- Revision / HEAD SHA: feature/core-engine working tree after Finder command, date-scoped diary inputs, and model option refresh
- Timestamp: 2026-07-02T04:39:00Z
- Target URL / public entry: http://127.0.0.1:5173
- Core API: http://127.0.0.1:4317/api/health
- Test depth: Level 3
- Subagent attempt: not used
- Subagents used: none
- Fallback reason: available subagent tool policy requires an explicit user request for delegation; main agent performed a separate black-box pass.
- Result: PASS

## Scenarios

- [PASS] Open CLI Agents and inspect current model options.
  Expected result: Claude Code exposes Default, Opus 4.8, Sonnet 5, Haiku 4.5, Opus 4.7, Opus 4.6, and Sonnet 4.6; Codex CLI exposes Default, GPT-5.5, GPT-5.4, and GPT-5.4-Mini.
  Actual result: desktop and mobile browser text contained all required model labels.

- [PASS] Inspect current reasoning options.
  Expected result: agent reasoning dropdowns expose Default, Light, Medium, High, Extra High, and Speed.
  Actual result: desktop and mobile browser text contained Extra High and Speed.

- [PASS] Click the Workspace folder button in Web dev runtime.
  Expected result: Web dev runtime does not claim Finder success because the Tauri native bridge is unavailable; packaged macOS builds use the native `open_project_folder` command.
  Actual result: clicking `開啟資料夾` showed the truthful fallback toast: Web dev runtime cannot directly open Finder and should use the macOS packaged app.

- [PASS] Desktop RWD check.
  Expected result: no horizontal overflow or overlapping controls at 1440x950.
  Actual result: `body=1440`, `doc=1440`, `viewport=1440`, `overflow=false`; console errors: 0.

- [PASS] Mobile RWD check.
  Expected result: CLI Agents controls remain readable and reachable at 390x844 without horizontal overflow.
  Actual result: `body=390`, `doc=390`, `viewport=390`, `overflow=false`; console errors: 0.

- [PASS] Core health check.
  Expected result: Core responds with contract v5 and runtime metadata.
  Actual result: `/api/health` returned `ok: true`, API contract `5`, host `127.0.0.1`, port `4317`.

## Evidence

- Screenshots:
  - `/tmp/codex-ui-shot-df89aa9b86f2.png`
  - `/tmp/devdiary-mobile-smoke.png`
- Commands / artifacts:
  - `curl http://127.0.0.1:5173` returned the Vite app shell.
  - `curl http://127.0.0.1:4317/api/health` returned Core `ok: true`, contract `5`.
  - Playwright desktop overflow eval returned `overflow:false`.
  - Playwright mobile overflow eval returned `overflow:false`.
  - Playwright text assertions found every refreshed Claude Code and Codex CLI model label.
  - Playwright text assertions found refreshed reasoning labels, including `Extra High` and `Speed`.
  - Hook evidence sentinel touched: `/tmp/codex-ui-verified-df89aa9b86f2`.
- Console errors: none
- Network/API errors: none observed during black-box smoke

## Findings

- Severity: none
- Reproduction steps: not applicable
- Expected: not applicable
- Actual: not applicable

## Residual Risk

- The native Finder open path is covered by Rust compile checks and unit-level UI invoke assertions, but the actual macOS Finder launch still needs one manual check in a packaged Tauri app because localhost Web runtime intentionally cannot execute Tauri native commands.
