# QA Black-Box Report

- Environment: isolated Node 22 Core runtimes, local Ollama 0.20.0, desktop Vite UI
- Revision / HEAD SHA: `3dccf669dc4b952818a89378cf1e4754d708248d` plus the current uncommitted candidate diff
- Timestamp: `2026-08-26T06:06:40Z`
- Target URL / public entry: `http://127.0.0.1:4318`, `http://127.0.0.1:4319`, `http://127.0.0.1:11434`, `http://127.0.0.1:5173`
- Test depth: Level 4
- Owner / QA Worker identity: `/root` / `/root/spec_initial_review`
- Independence method: different read-only agent; focused GET/SQLite/runtime verification after Owner smoke
- Bounded lens used: provider runtime freshness, background telemetry projection, reversible reconciliation history
- Result: PASS

## Scenarios

- [PASS] Latest-source Core on 4318 reported API contract 6; Settings selected `qwen3:8b`, local endpoint, thinking off and schedule `23:40`.
- [PASS] Fresh scheduler run recorded one Daily highlight provider success, zero fallback/failed, no fallback categories, and matching configured/actual agent ids.
- [PASS] Ollama tags listed `qwen3:8b` and the isolated provider database passed `integrity_check`.
- [PASS] Background JSON formatter projected the full typed `diary.telemetry` object; focused Node 22 test passed.
- [PASS] Reconciliation runtime exposed restored project id 1 through `GET /api/projects`; it was `present`, not ignored or paused, with zero miss count.
- [PASS] The successful reconciliation period recorded `marked_missing=1`; sessions, Daily diary, summary, Kanban, comments and docs each remained at one row for the same project id; database integrity was `ok`.
- [PASS] Supported desktop capture showed the connected custom Ollama card and all provider controls without overlap.

## Evidence

- Screenshots: `output/playwright/ollama-settings-final-1280x820.png`
- Commands / artifacts: Core health/settings/scheduler GETs, Ollama tags GET, read-only SQLite counts and `integrity_check`, focused `backgroundRunner.test.ts`
- Console errors: none relevant to the verified flow
- Network/API errors: none in the final focused rerun

## Findings

- Severity: none open
- Reproduction steps: not applicable
- Expected: current Core and provider runtime expose honest outcome telemetry; missing-project reconciliation preserves history and restores the same row
- Actual: matched expected behavior

## Residual Risk

- This report covers safe isolated runtimes and the supported desktop viewport. Packaged App identity, live database backup, installed LaunchAgent and rollback are verified separately during the authorized local rollout.
- No public release, notarization, long-duration sleep/soak or remote provider endpoint is claimed.
