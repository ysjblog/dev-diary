# Delta: DevDiary Brag Video Polish

> Feature: 調整 DevDiary launch video 的第二頁文案、Settings 進場與 Outro 音效
> Base spec: `docs/specs/dev-diary-macos-app.md`（展示資產；不變更 app runtime）
> Branch: `codex/brag-video-polish`
> Date: 2026-07-10
> Status: implemented

## 修改 (Changed)

- `media/devdiary-brag-2026-07-10.mp4` 更新為 66 秒修正版。
- 第二頁改為固定兩行的短句，保留 local-first 與專案開發脈絡定位。
- Settings 第一張實際截圖與畫面卡片同時進場，不再先顯示空白佔位框。
- 移除 QR code 出場的 impact bell；Outro 僅保留背景音樂淡出。

## 影響範圍（Impact）

- 受影響範圍：僅 repository media asset；無 app code、API、資料庫或使用者流程變更。
- README inline player：GitHub 對 repository MP4 的 `<video>` HTML 會 sanitizer 移除；需以 GitHub attachment asset URL 嵌入。此步驟待 Chrome extension 開啟 file URL access 後再完成。

## 驗收條件

- [x] HyperFrames lint 為 0 errors；validate 為 0 runtime/contrast failures；inspect 完成。
- [x] 最終 MP4 為約 66 秒，並已抽查第二頁、Settings 起始畫面與 Outro render frame。
- [x] Composition 不再包含 QR code impact bell audio element。
- [ ] README inline player：等待 GitHub attachment upload permission。
