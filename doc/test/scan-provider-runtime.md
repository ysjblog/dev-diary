# Scan Provider Runtime Policy Test Plan

## Test Depth Route

- Level: 3
- Reason: Runtime scan provider policy controls local CLI log reads, deterministic mock fallback, API scan persistence, and source identity behavior across Core services.
- Required verification: provider policy unit/integration tests, existing parser integration tests, API smoke, Core typecheck, root UI build, security review, diff review.
- Allowed skips: UI/RWD screenshots; this slice does not change React rendering or interaction.

## Bug Pattern Coverage

- [x] Rule priority conflicts: explicit `DEVDIARY_SCAN_PROVIDER=mock` wins over CLI default.
- [x] Boundary values / empty input: no matching CLI logs with persistent DB writes no fake mock records.
- [x] Contract generated and execution applied: default provider parses fixture CLI logs through `runManualScan`.
- [x] Operation order invariants: fallback only runs after CLI provider returns no sessions.
- [x] Production-like dirty data: parser warning and dirty source identity coverage remains in `cli-log-parser` tests.
- [x] State/history/retry/refresh behavior: repeated scan idempotency remains covered for parsed sessions and deterministic mock.
- [x] Externally observable result: API smoke verifies scan endpoint response and refreshed snapshots.
- [x] Security-sensitive local path handling: no project folder writes, no shell execution, no raw transcript persistence.

## Runtime Verification Route

- Runtime smoke: REQUIRED
- Black-box QA: OPTIONAL
- Safe environment or localhost command: temporary SQLite / fixture home roots / loopback API only
- Safe test account / mock access: no external accounts; no real secrets
- Forbidden or destructive actions: do not write project folders, do not read or persist raw transcript content, do not shell out from parser

## [x] 【整合流程】default runtime provider 會優先解析 CLI logs
**範例輸入**：fixture Claude Code / Codex CLI logs + `createConfiguredScanProvider({})`。
**期待輸出**：`runManualScan` 寫入 parsed `claude-code://...` / `codex-cli://...` sessions，且不直接寫 deterministic mock Kanban。

## [x] 【資料邊界】persistent DB runtime 沒有 matching CLI logs 時不寫 mock fallback
**範例輸入**：`DEVDIARY_DB` 指向 persistent SQLite path，fixture home 沒有 matching logs。
**期待輸出**：scan 成功但新增 0 sessions / 0 Kanban；既有資料不變。

## [x] 【整合流程】in-memory dev runtime 沒有 matching CLI logs 時保留 mock fallback
**範例輸入**：`DEVDIARY_DB=:memory:`，fixture home 沒有 matching logs。
**期待輸出**：scan 成功並新增 deterministic mock session / Kanban，維持 dev/test UX。

## [x] 【規則優先】DEVDIARY_SCAN_PROVIDER=mock 可強制 deterministic provider
**範例輸入**：`DEVDIARY_SCAN_PROVIDER=mock`。
**期待輸出**：scan 使用 deterministic mock provider，不依賴 CLI logs。
