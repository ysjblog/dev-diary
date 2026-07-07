# Scan Now / Project Rescan Test Plan

## Test Depth Route

- Level: 3
- Reason: 新增 Core scan API、SQLite idempotent persistence、Dashboard/Workspace UI workflow，且牽涉本機 project path 邊界。
- Required verification: Core tests/typecheck、UI build、API smoke、Playwright desktop/mobile smoke、black-box QA、security review、diff check。
- Allowed skips: 真實 Claude Code / Codex CLI / Antigravity CLI log parser 尚未實作；本切片使用 deterministic mock scanner 固定 API contract。

## Bug Pattern Coverage

- [x] Input normalization / aliases / format variants：project id 與 range query 驗證。
- [x] Boundary values / empty / null / malformed input：不存在、ignored、scan_paused、scanner failure。
- [x] Rule priority conflicts：scoped project rescan 只更新 selected project，不影響其他 project。
- [x] Negation / exclusion / opt-out / unlimited：ignored / scan_paused project 跳過。
- [x] Contract generated and execution applied：Core scan response 被 UI button 消費並刷新 snapshots。
- [x] Operation order invariants：scanner 成功並 transaction persistence 後才刷新 Dashboard / Workspace。
- [x] Production-like dirty data：既有 daily_logs per_project_summary JSON 需 merge，重複 scan 不重複。
- [x] Multi-condition combinations：global scan + selected project range refresh。
- [x] Security bypass mixed with normal input：project root read-only，不寫 project folder、不 shell out。
- [x] State/history/retry/refresh behavior：第二次 scan 不產生 duplicate sessions、diary blocks、Kanban cards。
- [x] Externally observable result, not only implementation detail：API smoke 與 Playwright button flow。

## Runtime Verification Route

- Runtime smoke: REQUIRED
- Black-box QA: REQUIRED
- Safe environment or localhost command: Core `127.0.0.1:4318` + Vite `127.0.0.1:5174`
- Safe test account / mock access: local deterministic in-memory DB only
- Forbidden or destructive actions: 不修改 project folder、不執行 mutating shell、不讀真實 CLI logs

## [x] 【function 邏輯】global scan 第一次新增 deterministic records，第二次不新增 duplicate
**範例輸入**：對 seeded DB 連續執行兩次 global scan。  
**期待輸出**：第一次 `inserted_sessions > 0`，第二次 `inserted_sessions = 0`；sessions、daily diary dates、Kanban `source_ref` 不重複。

## [x] 【function 邏輯】project rescan 只影響 selected project
**範例輸入**：只掃描 project 2。  
**期待輸出**：project 2 sessions/token_usage/Kanban 變化；project 1、3 totals 不變。

## [x] 【function 邏輯】ignored / scan_paused project 不會被掃描
**範例輸入**：把 project 2 設為 `scan_paused=1`，再跑 global scan。  
**期待輸出**：project 2 被列入 skipped，不新增 session/token/Kanban。

## [x] 【錯誤處理】scanner failure 不會留下 partial writes
**範例輸入**：注入會 throw 的 scanner provider。  
**期待輸出**：service 回 failed / endpoint 回 500；DB counts 與 scan 前相同。

## [x] 【Mock API】POST /api/scan 與 /api/projects/:id/scan 回 scan status 與 refreshed snapshots
**範例輸入**：POST global scan、POST selected project scan with range query。  
**期待輸出**：HTTP 200，body 包含 `scan.status=success`、Dashboard snapshot、project list；project scan 另含 selected ranged `project_detail`。

## [x] 【Mock API】invalid project id / missing selected project 回正確錯誤
**範例輸入**：`POST /api/projects/nope/scan`、`POST /api/projects/9999/scan`。  
**期待輸出**：分別回 400 / 404，且錯誤訊息可被 UI 顯示。

## [x] 【安全繞過】scan path 不寫 project folder、不執行 shell
**範例輸入**：把 seeded project root 指到臨時 Git repo，跑 scan。  
**期待輸出**：repo 檔案清單、`.git/HEAD`、`git status --porcelain` 不變。

## [x] 【整合流程】Dashboard Scan Now / 更新日誌 按鈕有 loading、success、failure copy
**範例輸入**：在 Dashboard 按 Scan Now / 更新日誌。  
**期待輸出**：按鈕 disabled 並顯示 scanning，成功後 toast 顯示 inserted/skipped，Dashboard/sidebar snapshots 重新載入。

## [x] 【整合流程】Workspace 重新掃描專案只刷新 selected project
**範例輸入**：選 project 2 後按重新掃描專案。  
**期待輸出**：project 2 detail 更新，未切換 selected project；其他 project 不新增 scoped scan records。

## [x] 【RWD】桌面與手機 viewport 操作 scan button 不破版
**範例輸入**：Playwright desktop/mobile 開頁並操作 scan/rescan。  
**期待輸出**：按鈕文字/icon 不重疊，主要工作流可操作。
