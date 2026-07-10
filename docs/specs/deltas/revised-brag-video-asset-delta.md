# Delta: Revised DevDiary Brag Video Asset

> Feature: 將更新後的 DevDiary launch video 加入 GitHub repository 供分享與下載
> Base spec: `docs/specs/dev-diary-macos-app.md`（產品展示資產；不變更 app runtime）
> Branch: `codex/brag-video-revision`
> Date: 2026-07-10
> Status: implemented

## 新增 (Added)

- `media/devdiary-brag-2026-07-10.mp4`：66 秒、1920×1080 的 DevDiary launch video。
- 成片定位強調 local-first 與一站式專案開發管理；Settings 以左側實際畫面、右側功能卡輪播呈現 Prompts、隱私與匯出、本機儲存。

## 修改 (Changed)

- 無應用程式程式碼、API、資料庫、設定或使用者流程變更。

## 移除 (Removed)

- 影片中獨立的 Automation 場景與其 Automation 訴求。

## 影響範圍（Impact）

- 受影響範圍：僅 repository 的 media asset。
- Runtime / security / privacy：無程式執行面變更；影片使用既有公開 GitHub URL 與產品 UI 截圖。
- MASTER.md：PR 合併後再於 delta 索引加入此展示資產紀錄；本 branch 不改變系統現況。

## 驗收條件

- [x] MP4 已存在於 `media/devdiary-brag-2026-07-10.mp4`。
- [x] 檔案 duration 為約 66 秒，並可由 `ffprobe` 讀取。
- [x] HyperFrames lint 為 0 errors；validate 為 0 runtime/contrast failures；inspect 完成。
- [x] 實際 render frame 已確認第二頁定位、Settings 左圖右卡輪播與不含 Automation 的 Outro。
