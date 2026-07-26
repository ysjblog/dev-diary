# Delta Spec: Kanban Hybrid Status Rules and Manual Lock Badge
> PR: feature/core-engine
> Date: 2026-07-06
> Status: implemented

## 新增（Added）

- Kanban auto synthesis 新增 mixed rule status policy：
  - `done` 仍只由 Git recent commit 產生。
  - `in_progress` 由最近非 failed session 產生。
  - `todo` 只在 session command / redacted excerpt 出現明確下一步、TODO、blocker、failed test、fixme、unfinished 等訊號時產生。
- TODO candidate 必須有 deterministic `source_ref`，格式固定為 `agent-synth://p{projectId}/todo/{agent}`，讓 repeated scan 更新同一張卡。
- Kanban card view contract 必須把 Core `status_locked_by_user` 映射到 UI，使用者手動移動過的卡片在 board 上顯示「手動調整」標示。
- 手動移動標示代表 auto synthesis / future AI candidate extraction 不可再改該卡片狀態；Core 既有 `status_locked_by_user = 1` 是 source of truth。

## 修改（Changed）

- `buildKanbanSynthesisCandidates` 從「session -> in_progress、commit -> done」擴充成「明確 task debt -> todo、session -> in_progress、commit -> done」的 mixed deterministic rules。
- `upsertKanbanCandidate` 保持 title / description / assignee 可更新，但 status 在 `status_locked_by_user = 1` 時不被 auto scan 覆蓋。
- UI card mapper 保留 `source_ref` 並新增 `manualStatusLock` view field，Kanban card render 根據此 field 顯示 badge 與 tooltip。
- Future AI task extraction 若接入，只能產生候選卡內容與建議狀態，不可覆蓋 locked card status；AI output 必須先被 Core schema 驗證、redact、dedupe，再進入相同 upsert path。

## 移除（Removed）

- 不恢復 dirty working tree 自動 TODO 卡；Git hygiene 仍由 Git tab / daily highlight 顯示，避免低訊號 board 噪音。
- 本 delta 不新增由 AI 直接寫入正式 Kanban 的 hot path；AI-authored card copy 仍需另行設計 strict JSON contract 與 review。

## 影響範圍（Impact）

- Core：`core/src/services/kanbanSynthesis.ts`、`core/src/services/scans.ts`（既有 lock semantics 應保持）、Core tests。
- API/View mapper：`src/api/projects.js`。
- UI：`src/App.jsx`、`src/index.css`。
- Docs/tests：`docs/specs/MASTER.md`、`doc/test/kanban-hybrid-status-lock.md`。

## 驗收條件

- [x] Session command / excerpt 含 `TODO`、`blocker`、`failed test`、`fixme`、`unfinished` 等明確訊號時，auto synthesis 產生 stable TODO card。
- [x] 最近非 failed session 仍產生 stable in-progress card。
- [x] Git recent commit 仍產生 done card。
- [x] Dirty working tree alone 不產生 TODO card。
- [x] TODO / in-progress / done repeated scan 透過 stable `source_ref` 更新既有卡，不產生重複卡。
- [x] 使用者手動移動卡片後，Core snapshot 的 `status_locked_by_user` 維持 true，後續 auto scan 不覆蓋 status。
- [x] UI Kanban card 對 `status_locked_by_user` 顯示「手動調整」標示，讓使用者知道 AI / auto scan 不會再改進度。
- [x] 卡片 title / description 仍不含絕對路徑、credential-like secret、raw transcript 字樣。
- [x] 桌面與手機 Workspace Kanban UI 無水平溢出或 badge overlap。
