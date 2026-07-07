# Workspace Diary / Docs / Token Hardening Delta

> Base spec: `docs/specs/dev-diary-macos-app.md`（§7, §11, §15）
> Status: implemented
> Branch: `feature/core-engine`
> Date: 2026-07-01

## Problem

Workspace 的日記、留言、Kanban、Docs 與 token detail 已接 Core API，但本輪使用者驗證發現幾個 runtime / UI 缺口：

- 日記摘要左側 editor 與右側每日 diary block 的關係不清楚；點某一天的開發摘要不會把該日內容載入左側。
- Summary header 顯示 hardcoded `Markdown aware · Gemini-1.5-Pro Summarizer`，但 Core 預設 agent 並不是 Gemini。
- Docs tab 只讀 `project_docs`，但 scan 不會從 project root 讀取使用者指定的主文件。
- Comments filter 有 Global 分類，但新增留言時不能選 Global tag。
- Kanban 使用 HTML5 drag/drop，但沒有寫入 drag payload，部分 webview 無法穩定拖拉。
- Claude Code project path 內含 `_` 時，parser 找錯 `.claude/projects/*` 目錄，造成 Development log 的 Claude token usage 漏掃。

## Changes

- Core 新增 daily diary write routes：
  - `PUT /api/projects/:id/diary/:date`
  - `POST /api/projects/:id/diary/:date/regenerate`
- Daily diary write path 只更新 `daily_logs.per_project_summary[projectId]`，project-level `project_summaries` 仍維持整體專案摘要。
- Daily diary snapshot 對已持久化的 user / AI markdown 會原樣回傳，不再由 Core 額外 prepend 日期標題或 append `本日 X 個 session`，避免手動刪除後再次增生。
- Daily diary regenerate 在建立 agent snapshot 時使用被選取的日期作為 single-day context；`token_today` 會對準該日 range token，而不是 server today。
- React logs tab 支援點擊右側 diary block，將該日期的 diary markdown 載入左側 editor；保存時會寫回該日期。
- React logs tab 的清除日期 action 會同時清掉右側篩選與左側 daily editor state，回到 project-level summary。
- Summary header 移除假 provider 文案，改顯示 project-level / daily entry mode。
- Project-level AI draft 若與目前顯示摘要相同則不重複顯示，避免造成兩份相似摘要的錯覺。
- Settings 新增 `project_doc_filenames`，Core scan 會依 allowlist 從 project root 讀取相對檔名，預設包含 `README.md`、`docs/specs/MASTER.md`、`docs/specs/dev-diary-macos-app.md`、`MASTER.md`、`master.md`、`spec.md`。
- Docs preview modal 改為較大的 rich Markdown view，並補 light mode 對比。
- Scan 讀取 project docs 時拒絕 absolute path、`..` 與超大文件；UI 仍不直接讀 project folder。
- Comment 新增 Global tag option，既有 Global filter 可直接使用。
- Kanban drag start 寫入 `dataTransfer` payload，提升 Tauri/WebKit 拖拉可靠度。
- Claude parser 改用實際 Claude folder escaping（underscore 轉 hyphen），並保留舊 escaping fallback。

## Acceptance Criteria

- [x] 點擊某日 diary block 後，左側 editor 顯示該日內容；保存後重新讀取仍在該日 diary block 顯示。
- [x] Daily diary 手動保存後，讀回內容不會再自動增加日期標題或 `本日 X 個 session`。
- [x] AI 重新總結 daily diary 時，只更新該日期 `daily_logs.per_project_summary`，不覆蓋 project-level user summary。
- [x] AI 重新總結非今日 daily diary 時，agent snapshot 使用選定日期資料。
- [x] 清除日期後，左側 editor 回到 project-level summary。
- [x] Summary header 不再顯示 Gemini 或 Markdown-aware hardcode。
- [x] Comments 新增表單可選 Global，filter Global 能看到該 tag 留言。
- [x] Project Docs 會由 Core scan 讀取 Settings allowlist 中的相對檔名。
- [x] Project Docs preview 使用大型 rich Markdown modal，light mode 不再是灰色底。
- [x] Docs scan 不允許跳出 project root。
- [x] Development log 這種含 `_` path 的 Claude Code logs 能被 parser 找到。
- [x] Kanban drag/drop 在 webview 中有明確 drag payload。

## Verification

- `core/test/projectWrites.test.ts` 覆蓋 daily diary save/regenerate、原樣讀回、非今日 regenerate context。
- `core/test/scans.test.ts` 覆蓋 project docs allowlist scan 與 path traversal guard。
- `core/test/cliLogParser.test.ts` 覆蓋 underscore path Claude folder lookup。
- `src/api/projects.test.js` 覆蓋 daily diary API helper routes。
- `src/api/settings.test.js` 與 `core/test/settings.test.ts` 覆蓋 `project_doc_filenames` round-trip。
- Browser smoke 覆蓋 clear date 返回 project summary、Docs modal 920px desktop rich view、390px mobile 無 horizontal overflow。
