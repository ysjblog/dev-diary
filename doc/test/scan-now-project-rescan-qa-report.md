# QA Black-Box Report

- Environment: local Core `http://127.0.0.1:4319`, local UI `http://127.0.0.1:5175/`, in-memory deterministic DB
- Revision / HEAD SHA: `9b92187` + working tree changes
- Timestamp: 2026-06-29T05:51:18Z
- Target URL / public entry: `http://127.0.0.1:5175/`
- Test depth: Level 3; Runtime smoke REQUIRED; Black-box QA REQUIRED
- Subagent attempt: Not spawned
- Subagents used: none
- Fallback reason: available multi-agent tool explicitly disallows spawning subagents unless the user requested subagents; main agent performed a separate black-box pass and recorded the limitation.
- Result: PASS

## Scenarios

- [PASS] Dashboard `更新日誌` button: opened Dashboard, clicked `更新日誌`, expected Core scan request and success/failure UI; actual `POST /api/scan?range=all => 200`, toast showed scan started and completed.
- [PASS] Idempotent repeated global scan: after API smoke already inserted today's stable mock scan records, UI scan returned `新增 0 個 sessions、0 張卡片`; no duplicate visible Kanban card was added.
- [PASS] Workspace selected-project rescan: opened Workspace, clicked selected project `重新掃描專案`, expected scoped Core request; actual `POST /api/projects/1/scan?range=all => 200`, toast showed selected-project scan completed.
- [PASS] API error shape: `POST /api/projects/nope/scan` returned HTTP 400 with `invalid_id`, suitable for UI failure copy.
- [PASS] Desktop RWD/visual: 1440x1000 Workspace screenshot showed scan controls, metrics, project list, and Kanban without overlapping core UI.
- [PASS] Mobile RWD/visual: 390x844 Workspace screenshot showed project list, selected-project header, scan icon, save button, metric cards, and toast without broken layout; toast temporarily covers lower content as expected for transient notification.

## Evidence

- Screenshots:
  - `/tmp/codex-ui-shot-df89aa9b86f2.png` (desktop, 1440x1000)
  - `/tmp/devdiary-mobile-scan-rwd.png` (mobile, 390x844)
- Commands / artifacts:
  - Playwright request log showed `POST /api/scan?range=all => 200`
  - Playwright request log showed `POST /api/projects/1/scan?range=all => 200`
  - `curl -X POST http://127.0.0.1:4319/api/scan?range=24h`
  - `curl -X POST 'http://127.0.0.1:4319/api/projects/2/scan?range=custom&start=2026-06-29&end=2026-06-29'`
- Console errors: 0 browser console errors at `error` level
- Network/API errors: none during happy-path UI flows

## Findings

- Severity: none
- Reproduction steps: not applicable
- Expected: not applicable
- Actual: not applicable

## Residual Risk

- The scanner is still deterministic mock data. Real Claude Code / Codex CLI / Antigravity CLI log paths and schemas are intentionally deferred to the CLI log parser slice.
- Black-box QA used main-agent fallback because subagent spawning was not allowed without explicit user request.
