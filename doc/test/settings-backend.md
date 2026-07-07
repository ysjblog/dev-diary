# Settings Backend Test Plan

## Test Depth Route

- Level: 3
- Reason: Settings backend adds Core API write paths for app configuration, persists user-controlled paths/policies, and feeds project roots into the global scan contract.
- Required verification: doc/test cases, settings service unit tests, API integration tests, persistent DB restart test, localhost API smoke, Core typecheck, root UI build, security review, diff review.
- Allowed skips: UI/RWD screenshots; this slice adds backend API only and does not change React rendering.

## Bug Pattern Coverage

- [x] Input normalization / aliases / format variants
- [x] Boundary values / empty / null / malformed input
- [x] Rule priority conflicts
- [x] Contract generated and execution applied
- [x] Operation order invariants
- [x] Production-like dirty data
- [x] Multi-condition combinations
- [x] Security bypass mixed with normal input
- [x] State/history/retry/refresh behavior
- [x] Externally observable result, not only implementation detail

Irrelevant rows: auth/payment/webhook/file upload are not touched in this slice. Shell execution is forbidden and covered as a security invariant.

## Runtime Verification Route

- Runtime smoke: REQUIRED
- Black-box QA: OPTIONAL
- Safe environment or localhost command: temporary SQLite path, fixture project roots, loopback Core API
- Safe test account / mock access: no external accounts; local temporary folders only
- Forbidden or destructive actions: do not execute configured paths, do not write project folders, do not hot-swap SQLite connections, do not persist secrets/raw transcripts/prompts/responses/thinking

## [x] 【function 邏輯】GET settings 回傳 defaults 與 active runtime metadata
**範例輸入**：fresh DB + runtime defaults `{ dbPath, projectRoots }`。
**期待輸出**：settings snapshot 含 project roots、excluded paths、scan interval、default diary agent、privacy、appearance、scan provider policy、agent enable state，以及 active DB path；無 persisted rows 時使用 runtime/default values。

## [x] 【function 邏輯】PATCH settings 正規化並持久化可設定欄位
**範例輸入**：project roots 含空白/重複、appearance `dark`、privacy redact enabled、scan provider `mock`、agents enable/disable。
**期待輸出**：回傳 normalized snapshot；DB 內保存 normalized JSON；server restart 後 GET 仍一致。

## [x] 【錯誤處理】invalid settings payload 不留下 partial writes
**範例輸入**：`scan_interval_minutes=0`、unknown appearance、unknown agent id、non-array project roots、overlong path。
**期待輸出**：API 回 400 validation error；既有 settings 不變。

## [x] 【整合流程】PATCH project roots 後 global scan 使用 persisted roots
**範例輸入**：PATCH `/api/settings` 設定 temporary project root，再 POST `/api/scan?range=all`。
**期待輸出**：scan discovery 使用 persisted roots，回傳 discovered project；不需要重啟 server。

## [x] 【安全繞過】settings 不執行或讀取 configured command/path
**範例輸入**：看起來像 shell command 或 path traversal 的 project root / excluded path / data storage path 字串。
**期待輸出**：只做字串正規化與安全限制；不 shell out、不建立 project folder、不讀 credential content、不把 raw secrets 寫到 logs。
