# Kanban Auto-Synthesis + Daily Highlight Test Plan

## Test Depth Route

- Level: 4
- Reason: touches natural-language synthesis, SQLite schema migration, scan/scheduler state, API/UI contract, sensitive log redaction, and user override behavior.
- Required verification: Core unit/integration tests, UI API mapping tests, typecheck, UI build, runtime API smoke, browser/RWD screenshot, diff review, packaging verification when Tauri slice lands.
- Allowed skips: none for Core/UI; packaging may be recorded separately if platform toolchain is unavailable.

## Bug Pattern Coverage

- [x] Input normalization / aliases / format variants
- [x] Boundary values / empty / null / malformed input
- [x] Rule priority conflicts
- [x] Negation / exclusion / opt-out / unlimited
- [x] Contract generated and execution applied
- [x] Operation order invariants
- [x] Production-like dirty data
- [x] Multi-condition combinations
- [x] Security bypass mixed with normal input
- [x] State/history/retry/refresh behavior
- [x] Externally observable result, not only implementation detail

## Runtime Verification Route

- Runtime smoke: REQUIRED. Exercise `/api/scan`, `/api/projects/:id/scan`, `/api/scheduler/daily/run`, and `/api/dashboard` against localhost.
- Black-box QA: REQUIRED. Verify Dashboard summary panel and Workspace kanban state after smoke data changes.
- Safe environment or localhost command: local in-memory or temp SQLite runtime only.
- Safe test account / mock access: no external account required; agent unavailable path must use deterministic fallback.
- Forbidden or destructive actions: no writes to tracked project folders, no raw transcript exposure, no credential output.

## [x] 【function 邏輯】Kanban synthesizer 會從 recent sessions / git commits / dirty working tree 產生 deterministic cards
**範例輸入**：含 completed session、recent commit、dirty git status 的 ProjectDetailSnapshot。
**期待輸出**：候選卡片 source_ref 使用 `agent-synth://`，狀態分別對應 in_progress / done / todo，內容不含絕對路徑或 credential-like 字串。

## [x] 【整合流程】Manual scan 會執行 synthesizer，重跑不新增 duplicate 且會更新既有卡片文案
**範例輸入**：同一 project 連續跑兩次 scan。
**期待輸出**：第一次新增 synth card，第二次 `source_ref` 相同時 update 而不是 insert。

## [x] 【狀態回歸】使用者手動移動 Kanban card 後，agent 同步不得覆寫 status
**範例輸入**：先插入 `agent-synth://...` card，手動 PATCH status 到 `done`，再跑 synthesizer 提議 `in_progress`。
**期待輸出**：title/description 可更新，status 保持 `done`，`status_locked_by_user=1`。

## [x] 【function 邏輯】Daily scheduler 產生白話 global summary，不再寫計數模板
**範例輸入**：agent disabled 或 unavailable，跑 `runNow(force=true)`。
**期待輸出**：`daily_logs.global_summary_ai` 包含 達成 / 阻礙 / 下一步 白話句，不包含 `Projects checked` 或 `Project AI drafts refreshed`。

## [x] 【Mock API】Dashboard snapshot 回傳當日真實 daily highlights，無資料時回空陣列
**範例輸入**：一個 DB 有今日 `daily_logs.global_summary_ai`，另一個 DB 無 daily log。
**期待輸出**：`/api/dashboard` 的 `daily_highlights` 來自 Core 資料；無資料時為 `[]`。

## [x] 【狀態回歸】Dashboard parser 支援 AI 輸出的粗體 Markdown 標籤
**範例輸入**：`global_summary_ai` 使用 `* **達成**：...`、`* **阻礙**：...`、`* **下一步**：...`。
**期待輸出**：`/api/dashboard` 仍解析出三條 `daily_highlights`，Dashboard 不再顯示空狀態。

## [x] 【前端元素】Dashboard summary panel 使用 Core `daily_highlights`，不顯示寫死 mock
**範例輸入**：`toDashboardView()` 收到三條 highlights 或空陣列。
**期待輸出**：view 保留 badge/text；空資料時 UI 顯示空狀態而非假卡。

## [x] 【安全繞過】合成內容與每日摘要不洩漏 secrets、raw transcript、project root 絕對路徑
**範例輸入**：session summary / command / commit title 含 `/Applications/...`、`token=abc`、`password=...`。
**期待輸出**：輸出以 `[redacted-path]` / `[redacted-secret]` 取代敏感片段。
