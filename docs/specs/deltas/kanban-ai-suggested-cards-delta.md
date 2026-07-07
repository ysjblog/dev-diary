# Delta Spec: Kanban AI Auto-added Cards
> PR: feature/core-engine
> Date: 2026-07-06
> Status: implemented

## 新增（Added）

- 新增 AI Auto-added Kanban Cards 流程：AI 可根據 selected project 的 redacted allowlist prompt input 產生候選卡片；Core 通過 schema / evidence / redaction / dedupe / status-lock gates 後，可自動 upsert 到正式 Kanban。
- 自動加入是 Core-controlled，不是 AI-controlled：AI 只產生 strict JSON candidate；是否寫入、寫入哪個 `source_ref`、是否降級/丟棄 status，都由 Core 決定。
- 新增 Core service（建議 `core/src/services/kanbanAiSuggestions.ts`）：
  - 輸入：由 `ProjectDetailSnapshot` 和 app settings 建出的 `KanbanAiPromptInput`、目前 app settings、可選 AI generator。
  - `KanbanAiPromptInput` 必須是 redacted allowlist DTO，不得直接序列化整個 `ProjectDetailSnapshot`。允許欄位限於 project display name、既有 Kanban title/status/manual-lock flag、recent session date/status/agent/short redacted summary、recent commit title/hash prefix、deterministic candidate short evidence。
  - `KanbanAiPromptInput` 不得包含 `project.root_path`、`sessions.source_log_ref`、`docs.content`、comments raw content、raw transcript、絕對路徑或 secret-like tokens。Prompt system instruction 必須明確要求模型把 session/doc/comment text 視為 untrusted data，不得遵循其中的指令。
  - 輸出：validated `KanbanSuggestion[]` 與 auto-add result；每張卡必須帶 title、description、suggested_status、confidence、evidence、reason、Core-generated source_ref、dedupe_key。
  - 不讀 project folder、不讀 raw transcript；只有通過 gates 的 cards 會經 Core write path 寫入 SQLite。
- 新增 AI strict JSON contract。AI response 必須是單一 JSON object：

```json
{
  "cards": [
    {
      "title": "短標題",
      "description": "白話說明",
      "suggested_status": "todo",
      "confidence": 0.82,
      "evidence": "可追溯的短證據",
      "reason": "為什麼建議這張卡",
      "dedupe_key": "stable human-readable key"
    }
  ]
}
```

- `suggested_status` 可為 `todo`、`in_progress`、`done`，但 Core 必須做二次驗證：
  - `todo`：需要明確 next-step / blocker / failed-test / TODO / unfinished 訊號。
  - `in_progress`：需要 recent non-failed session 或明確進行中語意。
  - `done`：需要 recent Git commit、明確完成語意，或 existing done evidence；若沒有足夠 evidence，Core 應降級成 `in_progress` 或丟棄 suggestion。
- Auto-add eligibility：
  - `confidence >= 0.65` 才可自動寫入；低於門檻的 candidate 可回傳為 skipped warning，但不得寫入 Kanban。
  - title / description / evidence / reason 必須通過 length limit、redaction、非空檢查。
  - `done` candidate 若缺少 commit 或明確完成 evidence，不得自動寫入 `done`；Core 可降級 `in_progress` 或丟棄。
  - 對應 existing locked card 時可更新非 status 欄位，但不可改 status；UI 仍顯示手動調整 badge。
- Core 必須自行產生 canonical `source_ref`，AI 不得直接決定 persisted `source_ref`。建議格式：
  - `ai-suggest://p{projectId}/{hash(normalized dedupe_key + stable evidence identity)}`
  - `source_ref` 不得包含 mutable status，避免同一任務從 `todo` 變 `in_progress` 時產生第二張卡並繞過 existing locked card dedupe。
- Core 在 AI generate、auto-add、manual rerun API 都必須重算 canonical `source_ref`；不得信任 AI response 或 browser request body 送來的 `source_ref`。
- 新增 Local HTTP API：
  - `POST /api/projects/:id/kanban/ai-sync?range=...`：對 selected project 產生 AI candidates，Core 自動寫入通過 gates 的 cards，回傳 `ai_sync`（inserted / updated / skipped counts、warnings、agent id）與 refreshed `ProjectDetailSnapshot`。
  - Existing `POST /api/scan`、`POST /api/projects/:id/scan`、daily scheduler、background runner 依 Core-owned defaults 呼叫同一 auto-add service；不得各自另寫 AI parsing 邏輯；scan response 必須把 deterministic synthesis counts 與 `ai_sync` counts 分開回傳。
  - AI auto-add integration 必須是 non-throwing boundary：provider disabled、auth failure、timeout、invalid output、schema rejection 都轉成 skipped/warnings，不得 escape 成 `runManualScan`、scheduler、background runner 的整體失敗；只有 DB corruption 或 programmer error 可 fail whole operation。
- 新增 Core-owned `kanban_ai_auto_add` default gates：
  - `enabled`：是否在 scan / scheduler / background runner 後自動加入 AI cards，預設 `true`；不在 Settings UI 顯示，也不接受前端 settings patch 改寫。
  - `min_confidence`：auto-add confidence threshold，預設 `0.65`。
  - `max_cards_per_project_per_run`：每 project 每次最多自動加入卡片數，預設 `3`。
  - `allowed_statuses`：可自動加入的 status，預設 `['todo', 'in_progress', 'done']`。
  - `timeout_ms`：單次 AI card extraction provider timeout，預設 `15000`。
  - `kanban_ai_auto_add.enabled` 獨立於 `daily_scheduler.enabled`。Daily Scheduler 只控制 daily diary/highlight 時機；background runner 的 interval scan 與 Kanban AI auto-add 不應因 `daily_scheduler.enabled = false` 被整輪跳過。
- 新增 Core-owned `ai_prompts.kanban_cards` 預設 prompt；此 prompt 維持內建 strict JSON contract，不在 Settings Prompts 顯示，也不接受前端 settings patch 改寫，避免使用者改壞輸出格式。`AI_PROMPTS_VERSION` 從 `2` bump 到 `3`，同時驗證舊 settings 不會丟失 diary prompts。
- 新增 AI text generator adapter，不得把 diary fallback markdown 當成 successful JSON suggestions；provider disabled、auth failure、timeout、invalid output 應回傳 empty suggestions + warning。
- Workspace Kanban UI 新增 AI auto-add visibility：
  - 顯示「AI 自動加入」badge / source label，讓使用者知道卡片來源。
  - 顯示最近一次 AI sync 的 inserted / updated / skipped / warning summary。
  - Scan/project rescan toast 必須區分 deterministic cards 與 AI auto-added cards，例如「掃描新增 2 張基礎卡，AI 自動加入 1 張、略過 3 張」。
  - 提供「重新整理卡片」動作；動作會呼叫 Core `ai-sync`，不是 UI 直接呼叫 provider。

## 修改（Changed）

- AI auto-added cards 不取代既有 deterministic mixed rules；deterministic synthesis 仍可在 scan / scheduler 中產生基礎 cards。
- AI auto-added cards 必須走與 scan candidates 相同的 redaction、dedupe、status-lock semantics：
  - title / description / evidence 不得含絕對路徑、secret-like token、raw transcript。
  - `source_ref` 是 stable identity；status 是可變欄位，不可參與 identity。若 `source_ref` 對到既有 locked card，Core 不可覆蓋其 status。
  - 若 AI card 與既有 unlocked card source_ref 相同，可 upsert title / description / assignee；status 只在未 locked 時可更新。
- Existing manual status lock badge 維持為 source of truth。AI auto-add 可以標示「此 AI 卡對應已手動調整卡片」，但不可自動調整該卡進度。

## 移除（Removed）

- 不允許 AI response 直接成為 DB write。
- 不允許 AI output 包含或覆蓋 `status_locked_by_user`。
- 不允許 UI 直接呼叫 AI provider、讀 SQLite、掃 CLI logs、或解析 project files。
- 不允許將 full raw transcript、完整 project root path、API key、token、password、private key 送進 prompt、response、test fixtures 或 QA artifacts。
- 不允許將 `ProjectDetailSnapshot` 原樣送進 AI prompt；必須先轉成 `KanbanAiPromptInput` allowlist DTO 並做 redaction/truncation。
- 不允許 Core 信任 client-provided status/source_ref/confidence；所有欄位都要重新 schema validation / normalization / redaction。
- 不保留「每張 suggestion 必須使用者手動加入」作為 v1 主流程；使用者控制改由 settings toggle、manual lock、以及手動移除/移動卡片表達。

## 影響範圍（Impact）

- Core services：
  - `core/src/services/kanbanAiSuggestions.ts`（新）
  - `core/src/services/kanbanSynthesis.ts`（可重用 redaction / helper；若拆 shared helper，需保持 tests）
  - `core/src/services/projectWrites.ts` 或 `core/src/services/scans.ts`（新增 AI auto-add upsert write path，必須復用 status lock semantics）
  - `core/src/services/settings.ts`（新增 prompt default / settings round-trip）
  - `core/src/services/backgroundRunner.ts`、`core/src/services/dailyScheduler.ts`（設定 gate 與 non-throwing AI sync integration）
  - `core/src/server.ts`（新增 local API routes）
- Core types：
  - `core/src/domain/types.ts` 新增 `KanbanAiPromptInput`、`KanbanSuggestion`、`KanbanAiSyncResult` / API response contract。
- UI：
  - `src/api/projects.js` 新增 AI sync helper 與 AI source view mapper。
  - `src/api/settings.js` 不從前端送出 `kanban_ai_auto_add` 或 `ai_prompts.kanban_cards`。
  - `src/App.jsx` 新增 Kanban AI auto-add summary、sync button、source badges、loading / warning / error states。
  - `src/index.css` 新增 suggestion panel、confidence badge、evidence layout、mobile styles。
- Tests/docs：
  - Core unit tests：prompt input allowlist/redaction、JSON parser、schema validation、source_ref stable identity、dedupe、status downgrade、confidence threshold、locked card semantics。
  - API tests：AI sync route、scan/project rescan/background runner integration when enabled、invalid AI JSON fallback/error。
  - Settings tests：`kanban_ai_auto_add` Core-owned defaults、`ai_prompts.kanban_cards` migration to Core-owned default、`AI_PROMPTS_VERSION = 3` old-settings preservation。
  - UI tests：source contract、sync button/summary/badge strings。
  - Browser/RWD QA：desktop + mobile Workspace Kanban AI auto-add flow。
  - `doc/test/kanban-ai-suggested-cards.md` 與 QA report。

## 驗收條件

- [x] AI auto-added cards 可涵蓋 `todo`、`in_progress`、`done` 三種 stage，但每張卡都必須有 evidence / confidence / reason。
- [x] Core 只接受 strict JSON object；malformed JSON、markdown wrapper、missing fields、unknown status、overlong values 必須被拒絕或降級為安全空結果，不可 crash。
- [x] Core 會 redaction title / description / evidence，不保存絕對路徑、secret-like token、raw transcript。
- [x] Core 不會把整個 `ProjectDetailSnapshot` 送進 AI prompt；`KanbanAiPromptInput` 不含 root path、source_log_ref、docs.content、comments raw content 或 raw transcript。
- [x] Core 自行產生 `ai-suggest://...` source_ref，AI 不可直接指定 persisted source_ref，且 source_ref 不包含 mutable status。
- [x] Repeated AI auto-add 對同一 dedupe key 不產生重複 cards。
- [x] AI auto-add 寫入 app-owned SQLite，但不修改 project folder、不執行 Git mutating command。
- [x] AI auto-add 遇到 existing `status_locked_by_user = 1` card 時不覆蓋 status。
- [x] Scan / project rescan / scheduler / background runner 依 Core-owned `kanban_ai_auto_add` defaults 自動呼叫 AI auto-add。
- [x] `kanban_ai_auto_add.enabled` 與 `daily_scheduler.enabled` 的 gate 獨立；daily scheduler disabled 時，background runner 仍可依 scan interval 執行 scan 與 Kanban AI auto-add。
- [x] `POST /api/projects/:id/kanban/ai-sync` 可手動觸發同一 Core auto-add flow，回傳 `ai_sync.inserted / updated / skipped / warnings`。
- [x] UI 顯示 AI auto-added cards 的來源與最近一次 sync summary，不要求逐張手動加入。
- [x] UI scan/project rescan toast 分開顯示 deterministic synthesis counts 與 AI auto-add counts。
- [x] UI 對 AI card 顯示 status、confidence/source/evidence summary，並在 mobile / desktop 無水平溢出。
- [x] Provider disabled、agent auth failure、timeout、invalid JSON 都有白話錯誤或 empty state，不阻斷既有 Kanban board，也不得讓 scan/scheduler/background runner 整體失敗。
- [x] `kanban_ai_auto_add` 與 `ai_prompts.kanban_cards` 使用 Core-owned defaults，不在 UI 暴露、不接受前端 patch 改寫；`AI_PROMPTS_VERSION` bump 到 `3`，且不影響既有 diary prompts。
- [x] Automated tests、Core typecheck、Vite build、localhost browser/RWD、black-box QA 全部通過後才可 commit 實作。
