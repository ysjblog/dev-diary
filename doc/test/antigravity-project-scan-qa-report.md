# QA Black-Box Report

- Environment: local Core API, `127.0.0.1`, `DEVDIARY_DB=:memory:`, `DEVDIARY_SCAN_FALLBACK=none`
- Revision / HEAD SHA: pending commit on `feature/core-engine`
- Timestamp: 2026-06-29 Asia/Taipei
- Target URL / public entry: `http://127.0.0.1:44319`
- Test depth: Level 4
- Subagent attempt: not used
- Subagents used: none
- Fallback reason: subagent tool policy requires explicit user request for subagents; QA skill requirement was satisfied by a separate black-box main-agent pass.
- Result: PASS

## Scenarios

- [PASS] Health endpoint reachable. Expected `GET /api/health` to return 200; actual 200.
- [PASS] Global scan discovers configured root folders. Expected `/api/scan?range=all` to discover projects under `~/Projects` and `~/Workspace/side-projects`; actual project count 20, Side projects count 14, Project_exception count 6.
- [PASS] Global scan persists externally observable sessions without mock fallback. Expected `DEVDIARY_SCAN_FALLBACK=none` scan to return success and real parser records; actual `scan_status=success`, `inserted_sessions=428`.
- [PASS] Antigravity CLI records are visible through project detail API. Expected at least one session with `source_log_ref` beginning `antigravity-cli://`; actual 50 sessions, sample project root `~/Workspace/side-projects/house rental cron`.

## Evidence

- Screenshots: not applicable; this slice changed Core/API behavior only, no React UI or CSS.
- Commands / artifacts: local Core server on port `44319`, `POST /api/scan?range=all`, per-project `GET /api/projects/:id?range=all`.
- Console errors: none in final black-box pass.
- Network/API errors: none in final black-box pass.

## Findings

- Severity: none.
- Reproduction steps: none.
- Expected: none.
- Actual: none.

## Residual Risk

- Antigravity token usage remains low-confidence because the currently verified glog / transcript metadata does not expose stable token counters. Sessions are visible and de-duplicated by stable conversation ids, but token fields may remain zero until a stable usage source is identified.
