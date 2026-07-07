# Delta Spec: Kanban Refresh and Docs Folder Settings Regression
> PR: feature/core-engine
> Date: 2026-07-06
> Status: implemented

## 新增（Added）

- 新增 regression QA 記錄：`doc/test/kanban-doc-folder-settings-regression.md`。
- 新增 Playwright QA 截圖，覆蓋 Workspace Docs desktop、mobile、mobile docs scrolled view。
- Settings runtime capability gate 新增 `kanban.ai-sync`，讓舊 Core runtime 不會被誤判為完整可用。

## 修改（Changed）

- Project Docs folder picker 優先用已偵測 project path 換算相對路徑；選到 `/project/docs/specs` 時會存成 `docs/specs`，不再依上層 Project Roots 存成 `project/docs/specs`。
- Settings UI 的 folder-scan placeholder 與說明改為 `docs/specs`，對齊每個 project root 內的 relative folder contract。
- Kanban API helpers 將 route 404 轉成 stale Core runtime guidance，避免使用者只看到 `Core API error (HTTP 404)`。

## 移除（Removed）

- 無。

## 影響範圍（Impact）

- UI：`src/App.jsx`、`src/api/settings.js`、`src/api/projects.js`。
- Tests：`src/api/settings.test.js`、`src/api/projects.test.js`。
- Docs/QA：`doc/test/kanban-doc-folder-settings-regression.md`、`output/playwright/kanban-docs-regression-*.png`。

## 驗收條件

- [x] Selecting a folder under a detected project path converts to `docs/specs` instead of `project/docs/specs`.
- [x] `project_doc_folders=["docs/specs"]` persists through Core settings.
- [x] Docs-only scan for `Development log` ingests `docs/specs/*` docs.
- [x] Workspace Docs tab shows `docs/specs` documents with folder-scan badges.
- [x] Kanban stale route 404 shows restart guidance.
- [x] Live Core health reports `kanban.ai-sync`.
- [x] Kanban status move button succeeds through the browser UI and returns HTTP 200.
