# QA Black-Box Report

- Environment: localhost Vite `http://127.0.0.1:5173`, Core `http://127.0.0.1:4317`, packaged DevDiary.app Core
- Revision / HEAD SHA: `22e0343` + working tree changes
- Timestamp: 2026-07-02 12:03 Asia/Taipei
- Target URL / public entry: `http://127.0.0.1:5173` and packaged `DevDiary.app`
- Test depth: Level 3
- Subagent attempt: yes
- Subagents used: `0190abcd-ef00-7000-8000-00000000000e`
- Fallback reason: none; subagent completed code review, and main agent performed browser/API smoke verification.
- Result: PASS

## Scenarios

- [PASS] Dashboard token trend chart axis labels
  - Steps: Open Dashboard and inspect `Token 消耗量趨勢`.
  - Expected result: axis labels render with normal UI text instead of stretched SVG text.
  - Actual result: chart rendered HTML axis labels outside the stretched SVG; eval returned `axisLayer=true`, `svgAxisText=0`, `htmlAxisLabels=6`.

- [PASS] Daily diary selected-date clear
  - Steps: Open Workspace diary summary, select `2026-07-01`, then clear the date filter.
  - Expected result: selected-date view returns to the full project diary list.
  - Actual result: selected count changed from `1` back to full count `5`, and selected date became empty.

- [PASS] Packaged Core save preflight
  - Steps: Launch packaged `DevDiary.app`, then send a Tauri-origin CORS preflight for `PUT`.
  - Expected result: Core allows `PUT` so in-app diary save requests are not blocked before reaching the save endpoint.
  - Actual result: preflight returned `204` with `Access-Control-Allow-Methods: GET,POST,PUT,PATCH,DELETE,OPTIONS`.

- [PASS] Prompt defaults migration
  - Steps: Run Core settings regression test for legacy `ai_prompts` without the current prompt version.
  - Expected result: old local overrides are replaced by upgraded defaults.
  - Actual result: upgraded default prompts were returned until the user saves new overrides under the current version.

- [PASS] Scheduler does not overwrite confirmed manual daily diary summaries
  - Steps: Run Core daily scheduler regression test with a confirmed manual per-project summary.
  - Expected result: generated daily log preserves the confirmed manual entry.
  - Actual result: existing confirmed entry stayed unchanged while generated entries filled other project IDs.

## Evidence

- Screenshots:
  - `/tmp/codex-ui-shot-df89aa9b86f2.png`
  - `/tmp/codex-ui-shot-diary-clear-df89aa9b86f2.png`
  - `/tmp/codex-ui-shot-df89aa9b86f2-mobile.png`
- Commands / artifacts:
  - `npm test`
  - `cd core && npm run test -- test/projectWrites.test.ts test/dailyScheduler.test.ts test/settings.test.ts`
  - `cd core && npm run test`
  - `cd core && npm run typecheck`
  - `npm run build`
  - `cd src-tauri && cargo check`
  - `npm run package:mac`
  - Packaged Core health probe returned `ok`, port `4317`, contract `5`.
  - Packaged CORS preflight returned `GET,POST,PUT,PATCH,DELETE,OPTIONS`.
- Console errors: none observed in final browser smoke.
- Network/API errors: none observed in final verified success paths.

## Findings

- Severity: none for the verified regressions.
- Reproduction steps: not applicable.
- Expected: not applicable.
- Actual: not applicable.

## Residual Risk

- The final save-click smoke avoided writing through the packaged UI because it could overwrite the user's real diary content. The packaged Core save blocker was verified at the exact CORS layer that caused the in-app failure, and the daily diary UI flow was verified against the same frontend build through localhost.
- A larger future cleanup should continue separating project-level summary state from selected-date daily diary state, because the current UI still carries both concepts in one Workspace surface.
