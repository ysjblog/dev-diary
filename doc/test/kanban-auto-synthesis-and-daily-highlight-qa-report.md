# QA Black-Box Report

- Environment: local safe runtime, Core `http://127.0.0.1:4317`, UI `http://127.0.0.1:5174`, `DEVDIARY_DB=:memory:`, `DEVDIARY_SCAN_PROVIDER=mock`
- Revision / HEAD SHA: b47e40a
- Timestamp: 2026-07-01 01:08 Asia/Taipei
- Target URL / public entry: `http://127.0.0.1:5174/`
- Test depth: Level 4; Runtime smoke REQUIRED; Black-box QA REQUIRED
- Subagent attempt: spawned QA agent `0190abcd-ef00-7000-8000-00000000000d`
- Subagents used: yes
- Fallback reason: not applicable
- Result: PASS

## Scenarios

- [PASS] Open Dashboard at `http://127.0.0.1:5174/`, expected AI Global Summary List to show Core-backed `達成 / 阻礙 / 下一步`; actual DOM showed three summary items from Core seed/daily data.
- [PASS] Verify old mock copy is absent, expected no `成功部署 SQLite database schema`, `Antigravity CLI 佔用記憶體`, or `首次加載空白畫面`; actual DOM check returned `hasMock=false`.
- [PASS] Run `POST /api/scan?range=24h`, expected HTTP 200 and scan counters; actual result: `status=success`, `inserted_sessions=442`, `inserted_kanban_cards=30`, `updated_kanban_cards=0`.
- [PASS] Run `POST /api/projects/1/scan?range=24h`, expected HTTP 200 and kanban update path; actual result: `status=success`, `scanned_projects=1`, `updated_kanban_cards=5`.
- [PASS] Run `POST /api/scheduler/daily/run`, expected HTTP 200 and daily log / kanban sync; actual result: `status=success`, `project_drafts_updated=20`, `kanban_cards_updated=51`.
- [PASS] Run `GET /api/dashboard?range=24h`, expected `daily_highlights`; actual result included `達成`, `阻礙`, `下一步`, and did not include old mock summary text.
- [PASS] Resize browser to 390x844, expected no horizontal overflow or summary text clipping; actual DOM check returned `overflow=false`.
- [PASS] Resize browser to 1440x1000, expected no horizontal overflow or summary text clipping; actual DOM check returned `overflow=false`.
- [PASS] Independent QA subagent re-ran API and browser checks; actual result confirmed `daily_highlights_count=3`, `console errors=0`, `console warnings=0`, and `horizontalOverflowPx=0` on mobile.

## Evidence

- Screenshots:
  - `/tmp/codex-ui-shot-df89aa9b86f2.png`
  - `output/playwright/daily-highlight-mobile.png`
- Commands / artifacts:
  - Core smoke Node fetch script against `http://127.0.0.1:4317`
  - Playwright wrapper snapshot and DOM checks against `http://127.0.0.1:5174/`
  - Independent QA subagent browser/API pass
  - Hook verified flag: `/tmp/codex-ui-verified-df89aa9b86f2`
- Console errors: none observed by independent QA (`0 errors / 0 warnings`).
- Network/API errors: none in smoke path; all required API calls returned HTTP 200.

## Findings

- Severity: None.
- Reproduction steps: Not applicable.
- Expected: Not applicable.
- Actual: Not applicable.

## Residual Risk

- Runtime used in-memory DB and mock scan provider for deterministic safety; persistent DB behavior is covered by automated tests and should still be smoke-tested again before release packaging.
- Independent QA observed `POST /api/scan?range=24h` can take about 51 seconds after data has already been synthesized; performance tuning should be a separate hardening slice if the dataset grows.
- Independent QA observed an initial empty state before scan/daily data refresh; final reload showed correct highlights, but live auto-refresh timing can be improved later.
