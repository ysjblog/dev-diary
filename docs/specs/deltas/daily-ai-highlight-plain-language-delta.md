# Delta Spec: 每日 AI 重點改白話敘事（取代計數式文案）

> PR: feature/core-engine（後續 slice）
> Date: 2026-06-30
> Status: implemented（2026-07-01，branch feature/core-engine）

## 背景 / 問題

「每日 AI 重點」目前不是白話描述「今天做了哪些事」，而是計數式的技術文案，分兩層都有問題：

1. **後端**（`core/src/services/dailyScheduler.ts`）：
   - `buildGlobalSummary()` 產生固定模板：`Projects checked: N` / `Project AI drafts refreshed: M` / `Default diary agent: x` / `Next step: …`。
   - `upsertDailyLog()` 的 per-project 文案是 `name: X diary days, Y tokens all-time.`。
   - → 這些是 deterministic 計數字串，**不是 AI 產生的白話敘事**。真正的 AI agent（`agy --print`）只被用在「每個專案的 `markdown_ai` draft」，從沒被用來寫全域的每日重點。
2. **前端**（`src/App.jsx:1352`）：
   - Dashboard「AI Global Summary List (智能日記撮要)」是**寫死的 mock**：三條固定的 達成 / 阻礙 / 下一步 字串，**完全沒接** Core 的 `daily_logs`。

→ 使用者預期「用白話寫今天做了哪些事」**目前不存在**：後端是計數模板、前端是假資料。

## 新增（Added）

- **白話每日重點生成**：daily scheduler 跑完當日 per-project draft 後，彙整當天「實際發生的事」（新增/更新的卡片、completed sessions、commit 摘要、各專案進展），交給 diary agent 產生**白話、口語、可讀**的當日敘事，寫入 `daily_logs.global_summary_ai`。
- **結構化重點欄位**：輸出對齊 UI 既有 badge 結構（達成 / 阻礙 / 下一步），讓前端能直接渲染：
  - `達成`：今天完成了什麼（白話，例如「把 Core 的 manifest 生命週期補強好了，死掉的舊紀錄會自動清掉」）。
  - `阻礙`：卡在哪、什麼還沒解（若無則略過或寫「今天沒有明顯阻礙」）。
  - `下一步`：建議接著做什麼。
- **deterministic fallback**：agent 不存在 / 未登入 / 逾時 / disabled 時，仍以白話模板（由當天 structured data 組句，例如「今天在 N 個專案有進展，主要是 …」）取代目前純計數字串，**口吻仍是白話而非 `Projects checked: N`**。

## 修改（Changed）

- `core/src/services/dailyScheduler.ts`：
  - `buildGlobalSummary()` 從「計數模板」改為「白話敘事（agent 優先 + 白話 fallback）」。
  - 餵給生成器的 structured data 從「專案數 / draft 數」擴充為「當天真正發生的事件」（completed sessions、新增/移動的 kanban、commit 摘要、各專案一句話進展）。
- `src/App.jsx`（Dashboard「AI Global Summary List」）：**移除寫死 mock**，改讀 Core `daily_logs` 當日資料；以 達成 / 阻礙 / 下一步 badge 渲染白話內容；無資料時顯示空狀態提示而非假卡。
- `core/src/services/dashboard.ts` 或新 endpoint：補上把當日 `global_summary_ai`（結構化重點）回給前端的讀取路徑（目前 dashboard 只讀 `blockers/warnings/summary_status`）。
- `core/src/services/dashboard.ts`：Dashboard parser 接受 diary agent 常見的 `* **達成**：...` / `* **阻礙**：...` / `* **下一步**：...` Markdown 粗體標籤，避免 AI diary 已產生但 UI 顯示空狀態。

## 移除（Removed）

- 前端寫死的三條 mock 重點字串（`src/App.jsx:1352-1373`）。
- 後端 `Projects checked / drafts refreshed` 這種計數式 global summary 文案（改白話）。

## 影響範圍（Impact）

- 受影響模組：daily scheduler、diary agent（新 prompt 形態：global 每日敘事）、dashboard 讀取路徑 / API、Dashboard summary panel UI、Core tests、UI tests、specs、doc/test。
- 資料模型：沿用 `daily_logs.global_summary_ai` 存 Markdown 白話敘事；Dashboard API 解析為 `daily_highlights[]`（達成 / 阻礙 / 下一步）。
- MASTER.md 需更新：AI Diary Agent / daily scheduler 狀態、prototype-only（Dashboard 假 summary）、delta 索引。

## 驗收條件

- [x] 跑一次 daily scheduler 後，`daily_logs.global_summary_ai` 是白話敘事（描述今天做了什麼），不再是 `Projects checked: N` 式計數。
- [x] Dashboard「AI Global Summary List」顯示的是 Core 當日真實資料，不是寫死的三條 mock。
- [x] Dashboard parser 可解析 AI 輸出的 Markdown 粗體標籤格式。
- [x] agent 不可用時，fallback 仍是白話口吻（非純計數），且流程不被阻斷、API 回 200。
- [x] 白話內容不含 project root 絕對路徑、raw transcript、credential-like 欄位。
- [x] 無當日資料時 Dashboard 顯示空狀態，不顯示假卡片。
- [x] Core tests / UI tests / typecheck / build 全綠。

## 已知限制（Known Limitation）

- 白話品質依賴 agent；fallback 模板雖白話但較制式。
- 「達成 / 阻礙 / 下一步」三分類由 agent 判斷，可能不完美；以可讀、可交接為主要目標，不追求精準分類。
