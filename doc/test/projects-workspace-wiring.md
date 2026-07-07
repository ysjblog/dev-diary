> 狀態：初始為 [ ]、完成為 [x]
> 注意：狀態只能在測試通過後由流程更新。
> 範圍：Projects Workspace 讀取路徑接後端（spec §11）。Git 分頁延後（需真實 git reader）。

## Test Depth Route

- Level: 3
- Reason: 新增聚合 service + 帶 :id 使用者輸入的 endpoint，跨 Core↔UI 契約，碰持久化查詢與過濾/聚合。
- Required verification: core npm test（projects.test.ts + 既有 20 綠）、npm run typecheck、UI npm run build。
- Runtime smoke: REQUIRED（切換專案、瀏覽分頁）
- Black-box QA: REQUIRED（Level 3 外部可觀察；切片完成後派獨立第二輪黑箱驗證）
- Allowed skips: 寫入路徑、range-split、Git 分頁（皆延後，交付報告標 deferred）

## Runtime 驗證結果

- **自動測試**: core 32/32 passed（含本功能 12 案例）、typecheck clean、UI build OK。
- **Smoke result: PASS** — 主 Agent 從公開入口驗證：`/api/projects`（新聚合欄位）、`/api/projects/:id`（完整 snapshot），錯誤案例 `abc→400`、`9999→404`；經 Vite proxy 同樣通過。
- **Black-box QA result: PASS（main-agent fallback）** — Fallback reason: 環境 subagent 未派；改由主 Agent 以獨立通道（headless Chrome via CDP 載入 5174 → 切到工作區 → 擷取 DOM 與截圖）做第二輪黑箱驗證。確認專案列表、metric strip（today≤week≤month≤all）、Kanban 三欄計數、AI 摘要狀態皆由 Core 即時資料渲染，非 mock。截圖存於 hook 路徑。

## Bug Pattern Coverage

- [x] 輸入正規化 / 別名 / 格式變體（:id 非數字、ignored 專案）
- [x] 邊界值 / 空 / null / 畸形輸入（不存在的 id → 404；無 session/comment/kanban 專案 → 空陣列）
- [x] 規則優先衝突（summary：user override 優先於 ai）
- [x] 否定 / 排除（ignored=1 專案不出現在列表、:id 也 404）
- [x] 契約產生且實際執行（token by-agent/by-model 聚合 == session 原始 total；cost 欄位不存在）
- [x] 操作順序（先驗證 id → 再查詢；ignored 過濾先於聚合）
- [x] 類 production 髒資料（detected_agents JSON、null end_time/summary、空 daily_logs）
- [x] 多條件組合（kanban 三欄分組、diary by-month 分組）
- [x] 外部可觀察結果（API JSON 形狀 + UI 渲染，非僅內部）

---

## [x] 【function 邏輯】getProjectList 回傳非 ignored 專案，含 logs_count 與 token_total 聚合
**範例輸入**：seedDatabase(today=2026-06-28) 後 getProjectList(db)
**期待輸出**：陣列；每筆含 id/name/root_path/tracking_status/detected_agents(array)/git_branch/logs_count(number)/token_total(number)；不含 ignored 專案；token_total 等於該專案 sessions 的 SUM(token_total)。

## [x] 【function 邏輯】getProjectList 的 logs_count 等於該專案有活動的「不同日期數」
**範例輸入**：getProjectList(db) 中某專案
**期待輸出**：logs_count === COUNT(DISTINCT date) of that project's sessions（一天一個日誌 block）。

## [x] 【function 邏輯】getProjectDetail 回傳完整 snapshot 形狀
**範例輸入**：getProjectDetail(db, 1, today)
**期待輸出**：物件含 project / metric_strip / kanban[] / summary_markdown / diary[] / token_detail{rows,by_agent,by_model} / sessions[] / comments[] / docs[] / captured_at。

## [x] 【function 邏輯】metric_strip token 聚合分層正確
**範例輸入**：getProjectDetail(db, 1, today).metric_strip
**期待輸出**：token_today=當日 sessions SUM、token_week=近7天、token_month=近30天、token_all=全部；session_count=該專案 sessions 總數；皆為 number 且 today<=week<=month<=all。

## [x] 【function 邏輯】token_detail by_agent / by_model 聚合等於 rows 總和（契約產生且實際執行）
**範例輸入**：getProjectDetail(db, 1, today).token_detail
**期待輸出**：sum(by_agent.token_total) === sum(rows.token_total) === sum(by_model.token_total)；by_agent 用 canonical display name；任何欄位都不含 cost。

## [x] 【function 邏輯】diary 依月份分組、一天一 block，且為 Markdown 字串
**範例輸入**：getProjectDetail(db, 1, today).diary
**期待輸出**：每個 entry 含 id/date/title/markdown；同一 date 至多一個 entry；entries 依日期新到舊。

## [x] 【function 邏輯】summary：持久化 per_project_summary 優先於生成 fallback（規則優先）
**範例輸入**：某日 daily_logs.per_project_summary 有該專案文字 vs 無任何 per_project_summary 的專案
**期待輸出**：有持久化摘要時 summary_markdown 取最新該專案 per_project_summary；無則由 sessions 生成 fallback；兩者皆非 null。

## [x] 【function 邏輯】kanban 只含該專案卡片且狀態為三個合法 enum
**範例輸入**：getProjectDetail(db, 2, today).kanban
**期待輸出**：全部 card.project_id===2；status ∈ {todo,in_progress,done}。

## [x] 【function 邏輯】comments / docs 只含該專案資料且形狀正確
**範例輸入**：getProjectDetail(db, 1, today)
**期待輸出**：comments 每筆含 id/content/tags(array)/pinned(bool)/created_at；docs 每筆含 id/name/content；皆屬該專案。

## [x] 【function 邏輯】不存在或 ignored 的專案 id 回傳 null（→ API 404）
**範例輸入**：getProjectDetail(db, 9999, today) 及 ignored 專案 id
**期待輸出**：null。

## [x] 【function 邏輯】無 session/comment/kanban 的專案不 crash、回空陣列（邊界）
**範例輸入**：對只有基本資料、無子紀錄的專案呼叫 getProjectDetail
**期待輸出**：kanban/sessions/comments 為 []，metric_strip 全 0，summary_markdown 仍為非 null fallback。

## [x] 【Mock API】GET /api/projects/:id 回 200 + snapshot；非數字或不存在回 404
**範例輸入**：GET /api/projects/1、/api/projects/abc、/api/projects/9999
**期待輸出**：1 → 200 且 body.project.id===1；abc → 400 invalid_id；9999 → 404 not_found。

## [x] 【Mock API】GET /api/projects 列表含聚合欄位
**範例輸入**：GET /api/projects
**期待輸出**：200；每筆含 logs_count 與 token_total。

## [x] 【function 邏輯】getProjectList / getProjectDetail 對相同 seed 為 deterministic
**範例輸入**：兩個獨立 seed 的 DB 各呼叫一次（去除 captured_at）
**期待輸出**：deep equal。
