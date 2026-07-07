# Delta Spec: Scan Now / Project Rescan Core Endpoint

> PR: feature/core-engine
> Date: 2026-06-29
> Status: implemented

## 新增（Added）

- Core scan service：提供 deterministic mock scanner，先穩定 manual scan / selected-project rescan API contract。
- `POST /api/scan`：global manual scan，回傳 scan status、Dashboard snapshot、project list。
- `POST /api/projects/:id/scan`：selected project rescan，回傳 scan status、Dashboard snapshot、project list、selected ranged `ProjectDetailSnapshot`。
- Idempotent persistence：以 stable `source_log_ref` 與 Kanban `source_ref` 去重，避免 repeated scan 產生 duplicate sessions、diary blocks、Kanban cards。
- Scan response types：記錄 scope、status、scanned/skipped projects、inserted counts、started/completed/error。
- React API helpers 與 Dashboard / Workspace button handlers，讓 Scan Now / 更新日誌 / 重新掃描專案走 Core API。
- `doc/test/scan-now-project-rescan.md` 記錄 Level 3 測試、smoke、black-box QA criteria。

## 修改（Changed）

- Dashboard sidebar/header scan button 從 prototype `setTimeout` + local Kanban append 改為 Core API call + snapshot refresh。
- Workspace selected-project rescan 從 toast-only prototype 改為 scoped Core API call，並保留目前 Workspace range query。
- `MASTER.md` 將 manual scan prototype-only 項目更新為 Core endpoint 已接線，但 CLI log parser 仍 deferred。

## 移除（Removed）

- 移除 `handleRunScan` 直接新增 mock Kanban card、遞增 local logs count 的 prototype-only 行為。

## 影響範圍（Impact）

- 受影響的模組：Core scan service, Express local API, React Dashboard/Workspace API client, React button states, SQLite schema guardrail, tests, specs。
- MASTER.md 需更新的區塊：目前實作狀態、已知 prototype-only 行為、變更歷史、Open Questions / Deferred Work。

## 驗收條件

- [x] Global scan 與 selected-project rescan endpoint 可用。
- [x] Repeated global scan / project rescan 不產生 duplicate sessions、diary blocks、Kanban cards。
- [x] Selected-project rescan 只影響 selected project。
- [x] ignored / scan_paused project 不被掃描。
- [x] Scanner failure 不留下 partial writes，UI 顯示 failure。
- [x] Dashboard Scan Now / 更新日誌 有 loading、success、failure 狀態。
- [x] Workspace 重新掃描專案走 Core API 並刷新 selected project snapshot。
- [x] Core tests、typecheck、UI build、API smoke、Playwright desktop/mobile smoke、black-box QA 通過。
