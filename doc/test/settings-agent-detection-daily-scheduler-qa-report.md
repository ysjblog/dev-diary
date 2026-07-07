# QA Black-Box Report

- Environment: local Core `http://127.0.0.1:4330`, local Vite `http://127.0.0.1:5184`
- Revision / HEAD SHA: `b2e8edc` + working tree changes
- Timestamp: 2026-06-30 09:50 Asia/Taipei
- Target URL / public entry: Settings page, CLI Agents page, `GET /api/agents/detect`, `GET/POST /api/scheduler/daily`
- Test depth: Level 3, Runtime smoke REQUIRED, Black-box QA REQUIRED
- Subagent attempt: skipped
- Subagents used: none
- Fallback reason: available subagent tool policy requires explicit user authorization; main agent performed a separate browser/API black-box pass.
- Result: PASS

## Scenarios

- [PASS] Agent detection API. Steps: call `GET /api/agents/detect`. Expected: HTTP 200, three canonical agents, no raw command or token-like leak. Actual: HTTP 200, `agent_count=3`, no `Command failed:` / `SECRET_TOKEN`.
- [PASS] Scheduler status and settings patch. Steps: call `GET /api/scheduler/daily`, then `PATCH /api/settings` with `daily_scheduler.enabled=true` and `run_time_local=18:00`. Expected: HTTP 200 and persisted scheduler status. Actual: both returned HTTP 200.
- [PASS] Scheduler run-now. Steps: call `POST /api/scheduler/daily/run`. Expected: daily log updated and project AI drafts refreshed. Actual: HTTP 200, `status=success`, `daily_log_updated=true`, `project_drafts_updated=20`.
- [PASS] Settings desktop UI. Steps: open `http://127.0.0.1:5184`, click Settings at 1440x900, save screenshot. Expected: Daily Scheduler controls visible, no overflow. Actual: `scheduler=true`, `runNow=true`, `overflowCount=0`, screenshot saved.
- [PASS] CLI Agents desktop UI. Steps: click CLI Agents at 1440x900. Expected: detection button, Version, Binary path, three cards, no card overflow. Actual: all present, `cardCount=3`, `overflowCount=0`.
- [PASS] Settings mobile UI. Steps: resize to 390x844, click Settings. Expected: no horizontal overflow. Actual: `bodyWidth=390`, `viewport=390`, `overflow=false`.
- [PASS] CLI Agents mobile UI. Steps: resize to 390x844, click CLI Agents. Expected: detection fields visible, no horizontal or card overflow. Actual: `overflow=false`, `cardOverflow=0`.
- [PASS] Browser console. Steps: inspect warnings/errors after UI flows. Expected: no errors/warnings. Actual: 0 errors, 0 warnings.

## Evidence

- Screenshots:
  - `/tmp/codex-ui-shot-df89aa9b86f2.png`
  - `/tmp/devdiary-agents-detection-desktop.png`
  - `/tmp/devdiary-settings-scheduler-mobile.png`
  - `/tmp/devdiary-agents-detection-mobile.png`
- Commands / artifacts:
  - `cd core && npm test`
  - `cd core && npm run typecheck`
  - `npm test`
  - `npm run build`
  - `git diff --check`
  - API smoke with local Core `4330`
  - Playwright browser checks with local Vite `5184`
  - `touch /tmp/codex-ui-verified-df89aa9b86f2`
- Console errors: none.
- Network/API errors: none observed in the tested flows.

## Findings

- Severity: none.
- Reproduction steps: none.
- Expected: safe detection and scheduler UI/API flows work in local runtime.
- Actual: all checked flows passed.

## Residual Risk

- This implements an in-app Core scheduler while the process is running. macOS sleep, app closed, missed-run recovery, and OS-level launch behavior remain future Tauri/scheduler hardening.
