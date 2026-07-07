> 狀態：初始為 [ ]、完成為 [x]
> 注意：狀態只能在測試通過後由流程更新。
> 範圍：Projects Workspace 寫入路徑接 Core API（comments、Kanban status、summary override / AI draft）。

## Test Depth Route

- Level: 3
- Reason: Workspace 寫入跨 React UI、Core HTTP API、SQLite persistence，且處理 user input 與 project-scoped state。
- Required verification: core npm test、core typecheck、UI build、API smoke、browser/RWD smoke。
- Allowed skips: 不接外部 AI provider；AI regenerate 在本切片使用 deterministic Core draft，保留未來 AI Diary Agent 替換點。

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
- Safe environment or localhost command: Core on `127.0.0.1:4317`, Vite on `127.0.0.1:5174`
- Safe test account / mock access: local deterministic SQLite seed / local Core runtime
- Forbidden or destructive actions: project folder writes, mutating Git commands, shell execution from UI

## Runtime 驗證結果

- **自動測試**: `cd core && npm test` → 48/48 passed（含本切片 11 cases）；`cd core && npm run typecheck` → passed；`npm run build` → passed。
- **API smoke: PASS** — 使用本輪 Core `127.0.0.1:4318` + Vite proxy `127.0.0.1:5174` 驗證 comment create/pin/delete、Kanban status update、summary save/regenerate/accept-draft、invalid status → 400。
- **UI smoke: PASS** — Playwright 操作 Workspace comments、summary save/accept draft、Kanban drag/drop；desktop screenshot `/tmp/codex-ui-shot-df89aa9b86f2.png`，mobile screenshot `/tmp/devdiary-workspace-write-mobile.png`。
- **Black-box QA: PASS** — subagent attempt failed due usage limit; main-agent fallback performed separate black-box pass and recorded `doc/test/workspace-write-paths-qa-report.md`。

---

## [x] 【function 邏輯】新增 comment 會 trim content、正規化 tags，並持久化到 selected project
**範例輸入**：`addProjectComment(db, 1, { content: "  ship it  ", tags: [" Bug ", "", "Feature"] })`
**期待輸出**：回傳 snapshot 的 comments 含新留言；content 為 `ship it`；tags 為 `["Bug","Feature"]`；只屬於 project 1。

## [x] 【錯誤處理】空 comment、過長 comment、畸形 tags 會回 validation error 且不寫 DB
**範例輸入**：空白 content、超過上限 content、`tags` 非陣列
**期待輸出**：service/API 回 `invalid_body`；comments count 不變。

## [x] 【function 邏輯】comment pin toggle 只能更新同 project comment
**範例輸入**：project 1 更新自己的 comment pinned=true；project 2 嘗試更新 project 1 comment
**期待輸出**：前者成功並排序到前面；後者回 not found，不跨 project 修改。

## [x] 【function 邏輯】delete comment 只刪 selected project comment
**範例輸入**：刪除 project 1 的 comment；用 project 2 刪 project 1 comment
**期待輸出**：前者 snapshot 不再含該 comment；後者回 not found，資料仍存在。

## [x] 【function 邏輯】Kanban status update 只允許三個 v1 enum 並持久化
**範例輸入**：把 project 1 card 移到 `done`
**期待輸出**：snapshot 中該卡 status=`done`；DB row 更新；只允許 `todo|in_progress|done`。

## [x] 【錯誤處理】Kanban invalid status 或跨 project card 不寫 DB
**範例輸入**：status=`blocked`；project 2 更新 project 1 card
**期待輸出**：invalid body / not found；原 status 不變。

## [x] 【function 邏輯】summary save 建立 user override，且優先於 AI / fallback 顯示
**範例輸入**：`saveProjectSummary(db, 1, { markdown: "## 手動摘要" })`
**期待輸出**：`summary_markdown` 為手動摘要；`summary_source` 為 `user`；重新查 detail 仍保留。

## [x] 【function 邏輯】AI regenerate 只更新 AI draft，不覆蓋 user override
**範例輸入**：先 save user override，再 regenerate
**期待輸出**：`summary_markdown` 仍為 user override；`summary_ai_draft_markdown` 有新草稿；`summary_source` 仍為 `user`。

## [x] 【function 邏輯】接受 AI draft 必須明確呼叫 accept endpoint
**範例輸入**：user override + AI draft 後呼叫 accept
**期待輸出**：`summary_markdown` 改為 AI draft；user override 清除；`summary_source` 為 `ai`。

## [x] 【Mock API】Workspace write endpoints 會回傳刷新後 ProjectDetailSnapshot
**範例輸入**：POST comment、PATCH kanban、PUT summary、POST regenerate、POST accept
**期待輸出**：HTTP 200/201 且 body 含 project/kanban/comments/summary fields；invalid id → 400；not found → 404。

## [x] 【安全繞過】write paths 不讀寫 project folder、不執行 shell、不改 Git state
**範例輸入**：在 temp Git repo project root 旁執行 comment/kanban/summary writes
**期待輸出**：project folder file list、`.git/HEAD`、`git status --porcelain` 不因 Workspace writes 改變。

## [x] 【整合流程】UI comment / pin / delete / Kanban drag / summary save / AI regenerate 從 Core refresh
**範例輸入**：localhost UI 操作 Workspace 各寫入流程
**期待輸出**：畫面更新後重新 fetch 仍存在；toast 不再標示本地暫存；桌面與手機版無重疊或點擊失效。
