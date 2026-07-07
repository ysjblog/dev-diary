# Delta Spec: Scan Provider Runtime Policy

> PR: feature/core-engine
> Date: 2026-06-29
> Status: implemented

## 新增（Added）

- Core scan provider runtime policy：`DEVDIARY_SCAN_PROVIDER` 未設定時預設使用 CLI log provider，讓 Claude Code / Codex CLI parser 成為 runtime default。
- Explicit mock mode：`DEVDIARY_SCAN_PROVIDER=mock` 可強制 deterministic mock scanner，供測試或 demo 使用。
- Fallback policy：`DEVDIARY_SCAN_FALLBACK` 可用 `mock` / truthy 值強制 fallback，用 `none` / `off` / falsey 值關閉 fallback。
- Persistent DB guard：當 `DEVDIARY_DB` 指向 persistent SQLite path 且未明確啟用 fallback 時，沒有 matching CLI logs 不會寫入 deterministic mock records。
- `doc/test/scan-provider-runtime.md` 記錄 Level 3 測試、runtime smoke 與安全邊界。

## 修改（Changed）

- `runManualScan` 的 default provider 從 deterministic mock 改為 configured provider：預設 CLI logs；`:memory:` dev/test runtime 可在無 matching logs 時 mock fallback。
- 既有 deterministic scan tests 改為明確注入 `DEVDIARY_SCAN_PROVIDER=mock`，避免誤測 runtime default。
- `MASTER.md` 更新 Manual Scan / CLI log parser 狀態與變更歷史。

## 移除（Removed）

- 無。

## 影響範圍（Impact）

- 受影響的模組：Core scan service, CLI parser provider, scan tests, CLI parser integration tests, specs, doc/test。
- MASTER.md 需更新的區塊：目前實作狀態、Manual Scan / Project Rescan、CLI log parser、prototype-only 行為、變更歷史。

## 驗收條件

- [x] Default runtime provider 優先解析 CLI logs，而不是直接使用 deterministic mock。
- [x] Persistent DB runtime 沒有 matching CLI logs 時不寫 mock fallback。
- [x] In-memory dev runtime 沒有 matching CLI logs 時保留 deterministic mock fallback。
- [x] `DEVDIARY_SCAN_PROVIDER=mock` 可強制 deterministic scanner。
- [x] 既有 parser warning、source identity、idempotency、project-folder read-only invariant 維持通過。
