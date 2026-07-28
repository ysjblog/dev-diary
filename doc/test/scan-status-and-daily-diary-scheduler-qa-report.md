# QA Black-Box Report

- Environment: local Vite UI and local Core loopback, with a fresh browser's read-only guard preventing startup auto-scan from writing the user database
- Revision / HEAD SHA: `b4469854eff716f61f4d0a97078fd9c0b11605ee` (candidate worktree)
- Complete candidate manifest SHA-256: `fc69697af8c9c1c77f3e5fd04d624255cc40631aca5dd3ae2b6cc16565212e5d` from `doc/test/scan-status-and-daily-diary-scheduler-candidate-manifest.json`; it covers the executable source and both table-first and non-diary snapshot isolation coverage.
- Timestamp: 2026-07-28 21:48 Asia/Taipei
- Target URL / public entry: `http://127.0.0.1:5188/` (Vite); Core `http://127.0.0.1:4317`
- Test depth: Level 4; fresh independent desktop black-box observation plus Core regression and UI presentation evidence
- Owner / QA Worker identity: 主 task / Luna independent desktop QA Workers
- Independence method: fresh read-only desktop browser sessions, loopback GET observation, Core process-state observation, and no product source/spec/task-state changes
- Bounded lens used: desktop scan-control terminal presentation, idle usability, browser console, and Core table-first diary regression
- Result: PASS

## Scenarios

- [PASS] Vite UI loaded at 1280x900. The retained viewport is a real PNG of exactly 1280x900, with SHA-256 `764e4bfce743eba620b1f8d9bc5fb52797534d7d7a965d0c497c1306ccd64587`. It is tied to the candidate diff above and does not contain `正在同步 AI 建議`.
- [PASS] Guarded desktop shell and console. The live Core settings read returned `background_scan.running_operations: []`. The browser intercepted only its own settings GET response to make `project_roots` empty, preventing startup auto-scan from writing the user database. This correctly produced the first-run onboarding overlay; it was not dismissed because that could lead toward a settings write. The final guarded browser session recorded 0 errors and 0 warnings. It proves the loaded desktop shell and absence of the forbidden AI-sync wording, but does not claim an unobscured scan-control runtime interaction.
- [PASS] Read-only Core paths. `GET /api/settings`, `/api/scheduler/daily`, `/api/scheduler/daily/preflight`, `/api/exports/daily`, `/api/exports/backup`, and Workspace Daily diary snapshot `GET /api/projects/3?range=all` each returned 200. No Scan, Run now, save, confirm, or export UI control was clicked.
- [PASS] Targeted Core regression. `pnpm exec vitest run test/dailyScheduler.test.ts test/projectWrites.test.ts test/scans.test.ts` passed 3 files / 53 tests.
- [PASS] Terminal desktop scan presentation. A fresh independent read-only observation found `Scan Now` and `更新日誌` visible, enabled, with no `正在掃描…` / `更新中…` or spinner; console errors/warnings were 0. A separate process observation found a background `agy` child could still exist while those controls remain idle. This is correct: the user acceptance only forbids a spinner after the UI request has completed; it does not require unrelated background AI work to force the global control into scanning state.
- [PASS] Regression contract. `node --test src/api/autoScanPolicy.test.js src/api/appShell.test.js` passed, including the assertion that `isScanRunning` clears before returned Dashboard/Project refresh reads. `cd core && pnpm vitest run test/projects.test.ts test/dailyScheduler.test.ts` passed guards that reject legacy `per_project_summary` reads for both a confirmed row and a non-diary scheduler snapshot.
- [NOT APPLICABLE] Mobile viewport/RWD. Not executed, not captured, and not treated as a gap: the product/change contract is desktop-only and this QA assignment excludes mobile/RWD.

## Evidence

- Screenshots:
  - `output/playwright/verify-qa-final-guarded-1280x900.png` — retained real 1280x900 desktop viewport screenshot, SHA-256 `764e4bfce743eba620b1f8d9bc5fb52797534d7d7a965d0c497c1306ccd64587`.
- Commands / artifacts:
  - `curl http://127.0.0.1:5188/` -> 200; port 5188 listener confirmed.
  - Core read-only GET paths listed above -> 200.
  - `cd core && pnpm exec vitest run test/dailyScheduler.test.ts test/projectWrites.test.ts test/scans.test.ts` -> 3 files / 53 tests passed.
  - `node --test src/api/autoScanPolicy.test.js` -> 3 tests passed.
- Console errors: 0.
- Console warnings: 0.
- Network/API errors: none in the final read-only UI observation; `GET /api/health`, `/api/settings`, and `/api/scheduler/daily` returned 200.

## Findings

- Severity: none for the bounded desktop terminal-state scenario. Earlier QA initially misclassified a live `agy` child as terminal; this report records the corrected acceptance criterion and fresh idle observation.

## Residual Risk

- This was not a real pending-composite runtime reproduction: safely producing that state would require a scan write. The regression test is the applicable execution evidence, and must not be represented as black-box runtime proof.
- The browser-only read guard intentionally opens onboarding, so this run proves the Workspace Daily diary Core read endpoint rather than an unobscured Workspace Daily diary screen. It does not prove packaged-app behavior, provider execution, real scheduler Run now, confirmed-diary save/confirm interaction, long-running/sleep recovery, or concurrent-process behavior.
