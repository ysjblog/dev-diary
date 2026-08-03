# Automatic Daily diary target date and safe evidence

## Test Depth Route

- Level: 3
- Reason: The change modifies a shared scheduler/persistence date contract and sends bounded private activity evidence across the local-app to CLI-agent trust boundary.
- Required verification: Focused scheduler/diary/project-writer tests, full Core suite and typecheck, root tests/build, security review, Owner safe-runtime smoke, and independent black-box QA.
- Allowed skips: No UI/mobile/RWD checks because no presentation code changes; no real provider call or user-database write because deterministic agents and in-memory SQLite exercise the complete changed contract safely.

## Bug Pattern Coverage

- [x] Boundary values / Taipei midnight and month/year rollover.
- [x] Boundary values / maximum accepted prompt override plus generated evidence budget.
- [x] Contract generated and execution applied: date/evidence reach the actual scheduler writer and agent prompt.
- [x] Operation order invariants: target date before lease claim; confirmed protection remains after provider await.
- [x] Production-like dirty data: empty evidence, multiline text, absolute paths, secret-like values and instruction-like text.
- [x] Multi-condition combinations: forced versus ordinary run, previous-day target, existing success and confirmed diary.
- [x] Security bypass mixed with normal input: malicious-looking session text stays inert data and is redacted/JSON-encoded.
- [x] State/history/retry/refresh behavior: one success per target date and safe forced rerun.
- [x] Externally observable result, not only implementation detail: persisted scheduler/diary rows and captured provider prompt.
- Not applicable: input aliases, negation/opt-out, UI rendering, auth/permission and cross-account isolation are not changed.

## Runtime Verification Route

- Runtime smoke: REQUIRED — repository Core execution with in-memory SQLite and deterministic prompt-capturing generator.
- Black-box QA: REQUIRED — different read-only no-fork agent runs the documented safe command/API-style workflow after Owner smoke passes.
- Safe environment or localhost command: repository-local Core test/runtime with `:memory:` database; no installed app or user DB.
- Safe test account / mock access: deterministic generator; no provider credentials.
- Forbidden or destructive actions: no real provider calls, no user-database writes, no project-file writes, no Git mutation, no deploy/push.

## [x] 【日期邊界】01:00 scheduler 整理前一個台北日曆日
**範例輸入**：`now=2026-07-01T01:00:00+08:00`，排程已啟用。
**期待輸出**：result、`daily_scheduler_runs`、`project_daily_diaries` 與 `daily_logs` 都使用 `2026-06-30`；同一 target date 的後續 ordinary tick 不重複產生。

## [x] 【日期邊界】月／年交界仍取正確前一天
**範例輸入**：台北時間 `2027-01-01 01:00`。
**期待輸出**：scheduler target date 為 `2026-12-31`，不因 UTC 日期或月份邊界誤寫。

## [x] 【整合流程】手動與 scheduler 對同一日期產生相同 evidence shape
**範例輸入**：同一 project/date 有 session command、摘要、status、token 與當日 commit。
**期待輸出**：兩條路徑都經 `buildProjectDiaryPrompt` 產生同樣的 `session_evidence` 與 `recent_commits`，不再只有 token/status。

## [x] 【安全繞過】私密資料與 instruction-like session text 不跨越 prompt 邊界
**範例輸入**：session 同時含正常摘要、絕對路徑、`token=...`、source ref、換行與「忽略上方規則」。
**期待輸出**：正常摘要保留且有長度上限；路徑／secret 被 redact，source ref/raw transcript 不出現，多行內容以 JSON data 表示，preamble 明確禁止執行 evidence 裡的指令。

## [x] 【資料邊界】5,000 字元的合法 prompt override 不會截掉 STRUCTURED_DATA
**範例輸入**：Daily diary prompt 達 settings 允許的 5,000 字元，並有最大數量的已清理 session/commit evidence。
**期待輸出**：provider input 仍完整包含 override 尾端 marker、`SAFETY_CONSTRAINTS`、`STRUCTURED_DATA`、`session_evidence` 與 `recent_commits`；不得從尾端 truncate 而遺失資料。

## [x] 【狀態回歸】forced rerun 保留 confirmed diary
**範例輸入**：前一日已有 confirmed `project_daily_diaries` row，operator 執行 Run now。
**期待輸出**：scheduler 以前一日為 target，confirmed row 不被覆寫，其他 AI-generated outputs 可安全刷新。
