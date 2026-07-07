# Delta Spec: Workspace Kanban / Comments / Docs Scan Controls
> PR: feature/core-engine
> Date: 2026-07-06
> Status: implemented

## 新增（Added）

- Project Docs Scan 新增 `project_doc_folders` settings 欄位，代表 project root 內的相對資料夾全掃描。
- Settings UI 將 Project Docs Scan 分成「特定檔名」與「資料夾全掃描」兩段，讓使用者能看出目前選的是哪種掃描模式。
- Project Docs Scan 的「資料夾全掃描」列提供資料夾選取按鈕；在 Tauri runtime 選到 Project Roots 內的資料夾時，UI 會填入相對資料夾路徑。
- Docs scanner 對 folder mode 採 read-only、安全相對路徑、檔案大小上限、常見大型/隱藏資料夾排除。
- Comments filter 新增 UI/UX、Bug、Feature、Info 類別按鈕。
- Kanban 空欄位顯示 empty state，避免沒有卡片時看起來像載入失敗。

## 修改（Changed）

- Kanban session synthesis 改為同一 project / agent 更新同一張 in-progress 卡，不再依每個 session 產生不同 `source_ref`。
- Kanban synthesis 移除「Git working tree 髒檔」自動 todo 卡；Git hygiene 狀態仍留在 Git tab，避免 board 出現低訊號重複卡。
- Comments filter 移除「未分類」按鈕；Info 作為明確分類，不再被當作未分類。
- Project docs scan 仍保留 `project_doc_filenames`，並與 `project_doc_folders` 合併寫入 `project_docs` snapshot。

## 移除（Removed）

- 移除 Kanban board 上由 dirty working tree 自動生成的「收斂目前未提交變更」todo 卡。
- 移除 Comments filter 的「未分類」按鈕。

## 影響範圍（Impact）

- Core：`settings.ts`、`scans.ts`、`server.ts`、`backgroundRunner.ts`、`kanbanSynthesis.ts`。
- UI：`src/api/settings.js`、`src/api/projects.js`、`src/App.jsx`、`src/index.css`。
- Tests：Core settings / scans / kanban synthesis、UI settings / project view contract、doc/test、browser QA。

## 驗收條件

- [x] Repeated scan with multiple Codex sessions updates one stable in-progress synthesis card instead of inserting multiple similar cards.
- [x] Dirty working tree alone does not generate a Kanban todo card.
- [x] Comments filter includes UI/UX, Bug, Feature, Info and no longer includes 未分類.
- [x] Project Docs Scan settings round-trip both filename and folder arrays.
- [x] Folder scan reads safe files under configured relative folders and rejects absolute / `..` traversal.
- [x] Settings UI visually separates filename scan from folder full scan.
- [x] Folder full scan rows expose a folder picker and convert selected folders under Project Roots into relative paths before saving.
- [x] Docs tab cards show whether a document came from filename scan or folder scan when inferable from settings.
- [x] Desktop and mobile Workspace/Settings UI have no horizontal overflow.
