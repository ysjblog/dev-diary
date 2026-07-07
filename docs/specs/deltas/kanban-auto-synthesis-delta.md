# Delta Spec: Kanban Auto-Synthesis（Diary Agent 自動建立 / 更新卡片）

> PR: feature/core-engine（後續 slice）
> Date: 2026-06-30
> Status: implemented（2026-07-01，branch feature/core-engine）

## 背景 / 問題

目前每個專案的 kanban 卡片來源只有三種，且都不是「Agent 依實際開發活動自行維護」：

1. **deterministic seed**（`core/src/db/seed.ts`）：寫死的 demo 卡片（project 1/2/3）。
2. **mock scan provider**（`core/src/services/scans.ts:142`）：固定吐一張 placeholder 卡（「確認 CLI log parser 接線」），只在 `:memory:` / 測試 / 明確 mock 模式才會用。
3. **真實 CLI log parser**（`core/src/services/cliLogParser.ts:460`）：回傳 `kanban_cards: []`，所以**正式 runtime 的掃描從不產生任何卡片**。

唯一的卡片寫入 route 是 `PATCH /api/projects/:id/kanban/:cardId`（`core/src/server.ts:339`），且**只能改 status**（todo / in_progress / done），沒有 create / delete。

Diary Agent（`core/src/services/diaryAgent.ts`）目前**只讀** kanban（`buildProjectDiaryPrompt` 取前 5 張塞進 prompt），從不寫入。

→ 使用者預期的「Diary Agent 參考 session 內容 + git 記錄自動建立卡片、並定期更新」**目前完全不存在**。

## 新增（Added）

- **Core Kanban Synthesizer service**（新檔，建議 `core/src/services/kanbanSynthesis.ts`）：
  - 輸入：單一專案的 `ProjectDetailSnapshot`（已含 recent sessions、git status、diary、token detail）外加近期 git commit metadata（透過既有 `gitStatus` 服務 read-only 取得，不執行 mutating 指令）。
  - 輸出：`ScanKanbanCandidate[]`（沿用既有 `core/src/services/scans.ts` 的 candidate 型別與 `source_ref` 去重 upsert 路徑）。
  - 每張候選卡片帶 **deterministic `source_ref`**（例如 `agent-synth://p{projectId}/{stableKey}`），讓重跑時是 update 既有卡片而非產生重複卡。
- **卡片合成規則**（v1，保守、可解釋）：
  - 由 recent sessions 的 summary / command + git working tree 狀態推導「正在進行的工作」→ `in_progress` 卡。
  - 由近期 commit message（feat/fix/docs…）推導「已完成切片」→ `done` 卡。
  - 由 working tree 髒檔 / 未完成切片推導「待辦」→ `todo` 卡。
  - `assignee_agent_id` 取該 session 對應的 canonical agent（claude-code / codex-cli / antigravity-cli）。
- **Deterministic synthesis mode（v1 implemented）**：
  - 目前 Kanban 卡片由 Core deterministic synthesizer 根據 structured snapshot 產生，不讀 raw transcript。
  - Agent 不存在 / 未登入 / 逾時 / 空輸出 / disabled 時，流程不阻斷；Kanban synthesis 仍可產生卡片。
  - Agent-authored card copy 保留為後續品質提升，不作為本 slice 的 runtime 依賴。
- **定期更新觸發點**：
  - daily scheduler（`core/src/services/dailyScheduler.ts`）每日跑時，對每個 active project 呼叫 synthesizer。
  - 手動 `POST /api/scan` / `POST /api/projects/:id/scan` 也帶入 synthesizer 候選卡（接到既有 scan upsert 路徑）。

## 修改（Changed）

- `core/src/services/scans.ts`：upsert 路徑接受來自 synthesizer 的候選卡（既有 `source_ref` 去重邏輯沿用，不需新去重碼）。
- `core/src/services/dailyScheduler.ts`：`runNow` 迴圈在 regenerate diary draft 之外，新增一步「同步該專案 kanban」。
- `core/src/services/projectWrites.ts`：`updateKanbanCardStatus` 已支援使用者手動改 status；需新增「**使用者手動移動過的卡片，Agent 不得自動覆寫其 status**」的 override 標記（比照 summary user override 的 accept 模式），避免 Agent 把使用者拖到 done 的卡又拉回 in_progress。

## 移除（Removed）

- 不移除 seed / mock 卡片（測試仍需）。正式 runtime 改由 synthesizer 供卡，mock placeholder 卡僅保留在 mock provider。

## 影響範圍（Impact）

- 受影響模組：Core kanban synthesizer（新）、scans upsert、daily scheduler、projectWrites（user-override 標記）、git status 服務（讀 commit metadata）、Core tests、specs、doc/test。
- 資料模型：新增 `kanban_cards.status_locked_by_user INTEGER NOT NULL DEFAULT 0`，由 `openDb()` idempotent migration 補舊 DB；`source_ref` 作 dedupe/update key。
- MASTER.md 需更新：Workspace 聚合（§11）kanban 來源說明、prototype-only 行為、delta 索引。

## 驗收條件

- [x] 正式 runtime（CLI-logs provider）下，跑一次 daily scheduler 或 scan 後，active project 會出現由實際 session/commit 推導的卡片（非 seed、非 mock placeholder）。
- [x] 重跑 synthesizer 不會產生重複卡片（同 `source_ref` → update）。
- [x] 使用者手動把某卡拖到 `done` 後，再跑一次 Agent 同步，該卡 status 不被覆寫。
- [x] Agent 不存在 / 未登入 / 逾時時，仍以 deterministic fallback 產生卡片，流程不被阻斷、API 回 200。
- [x] 卡片內容（title/description/source_ref）不含 project root 絕對路徑、raw transcript、credential-like 欄位（沿用 diary redaction 邊界）。
- [x] Core tests（synthesis 規則 + upsert 去重 + user-override 保護）全綠；typecheck / build pass。

## 已知限制（Known Limitation）

- v1 合成規則保守：以 session summary / command + commit message + git working tree 為主，不深入解析 raw transcript 內容（沿用 read-only、redacted 邊界）。
- v1 Kanban card wording is deterministic; agent-authored card copy is deferred until a stricter structured JSON contract exists.
- commit metadata 讀取限本機 git，不對外。
- 卡片「自動關閉（done）」判定依 commit/working-tree 啟發式，可能有偽陽/偽陰；使用者手動 override 永遠優先。
