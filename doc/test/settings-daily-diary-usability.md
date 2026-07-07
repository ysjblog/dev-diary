# Settings 與 Daily Diary Usability 測試

## Test Depth Route

- Level: 3
- Reason: 這次同時改 Workspace daily diary state/history flow、Settings user-facing UI workflow、settings/file-path 顯示與匯出控制，以及 custom agent / Ollama 本機 probe 的 shell-adjacent 驗證。
- Required verification: API helper regression test、Core daily diary regression test、root build、localhost desktop/mobile smoke、security review、diff check。
- Allowed skips: 不跑 destructive production scenario；不執行付費或 production AI provider。本輪只對本機 Ollama 做短 prompt smoke，且不保存 custom agent 設定。

## Bug Pattern Coverage

- [x] Input normalization / aliases / format variants：日期必須維持 `YYYY-MM-DD` single-day custom range。
- [x] Boundary values / empty / null / malformed input：沿用 Core route/date validation；本輪不新增新的 date parser。
- [x] Rule priority conflicts：date picker 選定日期時，daily entry context 優先於 project-level summary。
- [x] Negation / exclusion / opt-out / unlimited：excluded paths/privacy toggles 重排後仍送原 settings patch。
- [x] Contract generated and execution applied：route date 與 refresh range 都要套用同一日期。
- [x] Operation order invariants：UI 只送 Core API patch，不直接讀寫 SQLite/project folder。
- [x] Production-like dirty data：舊日期 diary block 與無 block 的日期都不可落回 today prompt。
- [x] Multi-condition combinations：selected date + workspace 24h/all/custom range 時，daily regenerate 仍使用 selected date。
- [x] Security bypass mixed with normal input：settings 路徑輸入仍交給 backend validation/redaction，不在 UI 執行。
- [x] State/history/retry/refresh behavior：regenerate 後刷新 snapshot 仍找得到 selected date entry。
- [x] Externally observable result, not only implementation detail：localhost Settings 與 Logs smoke 要能看到 UI 無破版、狀態可操作。

## Runtime Verification Route

- Runtime smoke: REQUIRED
- Black-box QA: REQUIRED
- Safe environment or localhost command: `npm run dev` + local Core runtime
- Safe test account / mock access: local SQLite/dev data；不使用 production 帳號
- Forbidden or destructive actions: 不刪 project folder、不 raw dump SQLite、不印 secrets

## [x] 【function 邏輯】daily diary helper 會把日期轉成 single-day custom range
**範例輸入**：`singleDayRangeOptions('2026-06-27')`
**期待輸出**：`{ range: 'custom', start: '2026-06-27', end: '2026-06-27' }`，並讓 regenerate URL 包含 `range=custom&start=2026-06-27&end=2026-06-27`。

## [x] 【狀態回歸】選擇舊日期後左側 editor 進入 daily entry context
**範例輸入**：在 Logs tab 日期 picker 選 `2026-06-27`
**期待輸出**：左側標題顯示 `2026-06-27 日記摘要`；按 AI 重新總結時不呼叫 project-level summary regenerate。

## [x] 【前端元素】Settings 頁首只保留不可編輯的 Core runtime status
**範例輸入**：開啟 Settings 頁面
**期待輸出**：頁首顯示 Core runtime 狀態與 port/contract/checked；不顯示 Daily Scheduler、目前 DB path 或不可點擊的 capability chips。

## [x] 【RWD】Settings desktop/mobile 重排後無重疊
**範例輸入**：desktop 1440px 與 mobile 390px 開啟 Settings
**期待輸出**：Core runtime status、專案與掃描、Daily automation、外觀/匯出/隱私、資料儲存區塊都可讀，按鈕與輸入框不互相重疊。

## [x] 【安全繞過】Settings 重排不改 backend validation 邊界
**範例輸入**：project roots、excluded paths、desired DB path、privacy toggles
**期待輸出**：UI 仍只送 `PATCH /api/settings` structured patch；不直接讀寫 project folder、SQLite 或 secrets。

## [x] 【整合流程】Ollama custom agent probe 與模型短生成
**範例輸入**：`/usr/local/bin/ollama --version` safe probe；Ollama API `qwen3.6:27b` 短 prompt。
**期待輸出**：Core probe 回 `connected` 且不保存設定；Ollama local API 能回傳短句。

## [x] 【狀態回歸】單日儲存/AI 重新總結後仍可清除日期回到完整 Workspace 日記
**範例輸入**：selected date 寫入或 regenerate 回傳 single-day snapshot 後，按「清除」。
**期待輸出**：UI 重新 fetch 目前 Workspace range 的 ProjectDetail，右側日記清單不再卡在單日 snapshot。

## [x] 【錯誤處理】空白摘要不送出 Core PUT
**範例輸入**：把摘要 textarea 清空後按儲存。
**期待輸出**：UI 顯示「摘要內容不能空白」提示，不送出會失敗的 Core API request。
