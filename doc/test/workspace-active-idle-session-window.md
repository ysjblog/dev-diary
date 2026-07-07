> 狀態：初始為 [ ]、完成為 [x]
> 範圍：Workspace project status derives active/idle from recent sessions.

## Test Depth Route

- Level: 3
- Reason: Workspace status is a Core API contract consumed by list/detail snapshots and UI filters/badges.
- Required verification: targeted Core tests, frontend API mapper tests, Core typecheck, UI build or documented blocker, API smoke.
- Allowed skips: DB migration. RWD screenshots were completed to satisfy the repo UI verification hook even though schema and JSX/CSS are unchanged.

## Bug Pattern Coverage

- [x] Boundary values / exact 5-day threshold
- [x] Legacy dirty data (`paused`) does not become a user-visible Workspace status
- [x] Contract generated and execution applied by list/detail API snapshots
- [x] Operation order invariants (derive after loading persisted project, before returning API contract)
- [x] Production-like dirty data (no sessions despite persisted active/paused)
- [x] Externally observable result, not only implementation detail

## Runtime Verification Route

- Runtime smoke: REQUIRED
- Black-box QA: OPTIONAL; this is an API contract/status rule change without new UI controls.
- Safe environment or localhost command: local Express test server / `npm run dev` Core runtime.
- Safe test account / mock access: in-memory SQLite tests.
- Forbidden or destructive actions: no mutation of user project folders.

## Verification Result

- Targeted Core: `npm test -- projects.test.ts` passed.
- Full Core suite: `npm test` passed, 21 files / 175 tests.
- Core typecheck: `npm run typecheck` passed.
- UI API tests: `npm test` passed, 52 tests.
- UI build: `npm run build` passed.
- Runtime smoke: isolated `DEVDIARY_DB=':memory:' DEVDIARY_PORT=4399 npm start`; GET `/api/projects` and GET `/api/projects/:id?range=all` returned matching derived status.
- Browser/RWD: Playwright desktop screenshot `/tmp/codex-ui-shot-0acab7a1de0a.png` and mobile screenshot `/tmp/codex-ui-shot-0acab7a1de0a-mobile.png` loaded the Dashboard without blank state or visible layout breakage.
- Black-box QA: optional beyond the browser/RWD smoke; no new UI controls or layout changes.

## [x] 【function 邏輯】5 天內有 session 的專案顯示 Active
**範例輸入**：today=`2026-06-28`，project 最新 session date=`2026-06-24`
**期待輸出**：`getProjectList(db, today)` 與 `getProjectDetail(db, id, today)` 回傳 `tracking_status='active'`。

## [x] 【資料邊界】剛好 5 天沒有新 session 的專案顯示 Idle
**範例輸入**：today=`2026-06-28`，project 最新 session date=`2026-06-23`
**期待輸出**：Workspace list/detail 回傳 `tracking_status='idle'`。

## [x] 【狀態回歸】Legacy Paused 不作為 Workspace 可見狀態
**範例輸入**：persisted `tracking_status='paused'` 且 today 有 session
**期待輸出**：Workspace list/detail 依 session window 回傳 `tracking_status='active'`；若沒有近期 session 則回傳 `idle`。

## [x] 【Mock API】API list/detail 執行同一個 derived status contract
**範例輸入**：GET `/api/projects` 與 GET `/api/projects/:id`
**期待輸出**：同一 project 在兩個 endpoint 的 `tracking_status` 一致，且符合 5-day session window。
