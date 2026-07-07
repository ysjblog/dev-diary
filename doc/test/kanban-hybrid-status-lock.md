# Kanban Hybrid Status Rules and Manual Lock Badge Test Plan

## Test Depth Route

- Level: 3
- Reason: Cross-module Core synthesis, persisted status lock, API/view mapper, and Workspace UI workflow.
- Required verification: Core unit/integration tests, UI source/API tests, Core typecheck, Vite build, localhost desktop/mobile smoke.
- Allowed skips: Real external AI generation is skipped because this slice does not add an AI write hot path; future AI JSON extraction needs its own contract.

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
- Safe environment or localhost command: `http://localhost:5173` with local Core API only.
- Safe test account / mock access: no external account; app-local SQLite and existing localhost dev runtime.
- Forbidden or destructive actions: do not mutate project folders, do not run real AI card-writing, do not push or merge without explicit request.

## [x] 【function 邏輯】明確 TODO / blocker / failed-test 訊號會產生 stable TODO 卡
**範例輸入**：session command 或 redacted excerpt 包含 `TODO`、`blocker`、`failed test`、`fixme`、`unfinished`。
**期待輸出**：`buildKanbanSynthesisCandidates` 產生 `status: todo` 且 `source_ref` 為 `agent-synth://p{projectId}/todo/{agent}`。

## [x] 【function 邏輯】最近非 failed session 仍產生 stable in-progress 卡
**範例輸入**：project snapshot 有最近非 failed session。
**期待輸出**：產生 `status: in_progress` 且 `source_ref` 為 `agent-synth://p{projectId}/session/{agent}`。

## [x] 【function 邏輯】recent commit 仍產生 done 卡且 dirty worktree 不產生 TODO
**範例輸入**：Git recent commits 存在，working tree dirty 但無 TODO signal。
**期待輸出**：commit 產生 `done` card；dirty working tree alone 不產生 `todo` card。

## [x] 【狀態回歸】手動移動後 auto scan 不覆蓋 status
**範例輸入**：既有卡片 `status_locked_by_user = 1` 且 auto scan 用同一 `source_ref` 回傳不同 status。
**期待輸出**：title / description 可更新，但 status 保持使用者手動移動後的值。

## [x] 【前端元素】Kanban card 顯示手動調整 badge
**範例輸入**：Core KanbanCard snapshot 帶 `status_locked_by_user: true`。
**期待輸出**：UI mapper 輸出 `manualStatusLock: true`，Workspace card render 顯示「手動調整」標示與 tooltip。

## [x] 【安全邊界】自動產生卡片不洩漏 path / secret / raw transcript
**範例輸入**：session command/excerpt 含絕對路徑、token/password、raw transcript。
**期待輸出**：title / description 不含原始 path、secret 或 raw transcript 字樣。

## [x] 【RWD】桌面與手機 Kanban badge 不 overlap
**範例輸入**：桌面與 390px mobile viewport 開啟 Workspace Kanban。
**期待輸出**：卡片 title、description、manual badge、move controls 不水平溢出、不互相遮擋。
