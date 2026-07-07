# Delta: Projects Workspace Live API Wiring

> Feature: Projects Workspace（讀取路徑）由 mock 改接 Core API snapshot
> Base spec: `docs/specs/dev-diary-macos-app.md`（§11 Projects Workspace render order）
> Branch: `feature/core-engine`
> Date: 2026-06-29
> Status: implemented（list + Kanban / 日記摘要 / Token 明細 / 備忘錄 / Docs / Sessions 已接線；Git 分頁延後）

## 新增 (Added)

- `core/src/services/projects.ts`：Workspace 聚合 service。
  - `getProjectList(db)`：左欄列表項，含 `logs_count`（有活動的不同日期數）與 all-time `token_total`；排除 ignored 專案。
  - `getProjectDetail(db, id, today)`：單一 read-only snapshot — metric strip（today/week/month/all token + sessions + summary_status）、kanban、summary_markdown、diary（一天一 block）、token_detail（rows + by-agent / by-model；不含 cost）、sessions、comments、docs。缺項回空陣列；不存在 / ignored 回 `null`。
- Core API：`GET /api/projects/:id`（非數字 id → 400 `invalid_id`；不存在 → 404 `not_found`）。
- DB schema：`project_docs` 表（id / project_id / name / content / updated_at）+ index。
- Seed：`kanban_cards`、`comments`、`project_docs`，並豐富 `daily_logs.per_project_summary`。
- 型別契約（`core/src/domain/types.ts`）：`ProjectListItem`、`ProjectMetricStrip`、`ProjectTokenRow/Detail/BreakdownItem`、`ProjectDiaryEntry`、`ProjectComment`、`ProjectSessionView`、`ProjectDoc`、`ProjectDetailSnapshot`。
- `src/api/projects.js`：list + detail fetchers 與 view mappers（`toProjectListView`、`toKanbanCardView`、`toMetricStripView`、`summaryStatusLabel`、`formatTs`、`formatDuration`）。
- App.jsx：Workspace loading / error 狀態（projects / detail）。
- `core/test/projects.test.ts`（12 案例）、`doc/test/projects-workspace-wiring.md`（Level 3 計畫 + QA 結果）。
- `.claude/launch.json`：dev server pin `:5174`（`--strictPort`）讓 preview proxy 對映穩定。

## 修改 (Modified)

- `GET /api/projects` 改由 `getProjectList` 提供（新增 `logs_count` / `token_total` 聚合，回傳形狀精簡）。
- App.jsx：`projects` / `kanbanCards` state 改由 Core 載入（`useState([])` + fetch effect）；`selectedProject` 詳情、metric strip、Kanban、Token 明細、備忘錄、Docs、Sessions、日記 blocks 全部改讀 `projectDetail` snapshot。
- 日記 blocks 改吃 Core `diary`，日期 + 關鍵字篩選在回傳候選上組合（spec §11 step 6）。
- Token 明細表移除「預估成本」欄，改為合計 tokens（v1 Non-Goal：cost calculation）。
- 留言新增 / 置頂 / 刪除、摘要儲存、AI 重新總結：改為對 `projectDetail` 的本地 optimistic 更新（Core 寫回路徑延後）。

## 移除 (Removed)

- App.jsx 對 mock 物件的依賴：`selectedProject.tokens/comments/docs/sessions/logs` 與 `computeProjectRangeData` 不再使用（`INITIAL_PROJECTS` / `INITIAL_KANBAN` / `computeProjectRangeData` 常數已成死碼，待後續 cleanup 移除）。

## 修正的 prototype-only 行為（spec §11 / §15）

- 專案列表與 detail 改吃 persisted 聚合資料，非 mock 常數。
- Token 明細隱藏 cost（§15.11 / §11）。
- Kanban / comments / docs / sessions / 日記 blocks 改 data-backed。

## 尚未實作（後續 delta）

- Git Status 分頁：仍為 prototype `GIT_STATUS_BY_PROJECT`；需 Core 真實 read-only `GitStatusSnapshot`（跑 git，security-review）。
- Workspace 寫入路徑：留言 CRUD、Kanban 拖拉持久化、摘要儲存 / AI regenerate 走 Core POST endpoint（含 `DiaryEntry.markdown_user` override）。
- Dashboard / Workspace range state 拆分已由 `workspace-range-state-delta.md` 補齊。
- 手動 Scan Now / 重新掃描走 idempotent Core scan endpoint（spec §5.2）。
- 移除 App.jsx 死碼 mock 常數。
