# Settings Agent Detection And Daily Scheduler Test Plan

## Test Depth Route

- Level: 3
- Reason: 新增 Core API、Settings persistence、UI workflow、in-app scheduler state、external CLI safe probe，跨 Core/UI/SQLite/Browser。
- Required verification: Core unit/integration tests、Core typecheck、UI API tests、Build、API smoke、desktop/mobile browser screenshot、security review、diff check。
- Allowed skips: 不做 OS-level launchd/cron；本 slice 的 scheduler 是 Core process 內的 in-app scheduler，macOS sleep/app closed 行為留待 Tauri/scheduler hardening。

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

- Runtime smoke: REQUIRED
- Black-box QA: REQUIRED
- Safe environment or localhost command: local Core API + local Vite UI。
- Safe test account / mock access: unit tests inject fake agent detector and fake diary agent；live detection uses fixed canonical probes only。
- Forbidden or destructive actions: 不執行任意 shell command、不讀 project files、不讀 raw transcripts、不寫 project folders、不輸出 secrets。

## [x] 【function 邏輯】agent detection 使用 fixed argv 並 sanitize failure
**範例輸入**：fake exec 回傳 version / failure / timeout。
**期待輸出**：canonical agents 皆有 detection row；可用 agent 有 path/version；失敗 agent 只有 sanitized error，且沒有 raw command 或 token-like 字串。

## [x] 【Mock API】`GET /api/agents/detect` 回傳 safe detection snapshot
**範例輸入**：注入 fake detector 的 Core server。
**期待輸出**：HTTP 200；body 包含 `checked_at`、`agents`；不需要真實 CLI auth。

## [x] 【function 邏輯】daily scheduler run-now 產生 global daily log 與 project AI drafts
**範例輸入**：seeded DB + fake diary generator。
**期待輸出**：`daily_logs` 當日 row 更新；每個 project 有 AI draft；user override 不被覆蓋。

## [x] 【狀態回歸】automatic tick 只在 enabled / 到達時間 / 今日未跑時執行
**範例輸入**：daily scheduler disabled、未到時間、已跑過、force run-now。
**期待輸出**：disabled/early/already-run 會 skip；force run-now 會執行並記錄 last run state。

## [x] 【Mock API】scheduler status 與 run endpoint 可被 UI 呼叫
**範例輸入**：`GET /api/scheduler/daily`、`POST /api/scheduler/daily/run`。
**期待輸出**：status/run result 為 structured JSON；失敗回 sanitized message。

## [x] 【前端元素】Settings form 保存 daily scheduler 設定
**範例輸入**：settings snapshot 含 `daily_scheduler`。
**期待輸出**：form 顯示 enabled/run time；`formToSettingsPatch` 送出 structured `daily_scheduler` patch。

## [x] 【前端元素】CLI Agents 頁顯示 detection 結果
**範例輸入**：Settings agents + detection snapshot。
**期待輸出**：agent cards 顯示 connected/offline、path、version summary、checked time；重新偵測按鈕呼叫 Core endpoint。

## [x] 【RWD】Settings / CLI Agents desktop 與 mobile 沒有重疊或文字溢出
**範例輸入**：desktop 1440x900、mobile 390x844。
**期待輸出**：controls 可讀可點，agent path 長字串不撐破 card，scheduler panel 在 mobile 正常堆疊。
