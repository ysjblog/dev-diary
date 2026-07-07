# Delta Spec: Settings Agent Detection And Daily Scheduler
> PR: feature/core-engine
> Date: 2026-06-30
> Status: implemented

## 新增（Added）

- Core safe agent detection endpoint：偵測 canonical CLI agents 的 available/path/version/status，使用 fixed argv，不透過 shell，不讀 project folders 或 raw logs。
- Settings / CLI Agents UI 顯示 agent detection 結果，包含偵測時間、binary path、version summary、error summary 與 enabled 狀態。
- Core in-app daily scheduler service：在 Core process 運行時，可依 Settings 的 daily scheduler 設定每日產生 global daily log，並更新每個 project 的 AI summary draft。
- Scheduler API：提供 current status 與 run-now endpoint，供 UI 手動驗證與顯示最近執行結果。
- Settings backend 持久化 `daily_scheduler` 設定與最近執行狀態。

## 修改（Changed）

- Settings snapshot 新增 daily scheduler contract；React settings form 會保存 enabled/run time。
- CLI Agents 頁的「Agent detection 待接」改為真實 Core probe。
- Core server options 支援注入 agent detector / daily summary generator，讓 tests 不需要真實 CLI auth。
- `docs/specs/MASTER.md` 需更新 Settings UI、AI Diary Agent 與 scheduler 狀態。

## 移除（Removed）

- CLI Agents 頁「尚未接上」的 toast-only placeholder。

## 影響範圍（Impact）

- 受影響模組：Core settings service, agent detection service, daily scheduler service, Express routes, React settings/agents UI, UI settings adapter, Core/UI tests, docs/test, MASTER.md。
- 安全邊界：UI 不直接執行 CLI；Core detection 不接受任意 command/path；scheduler 不讀 project files、不寫 project folders、不保存 raw prompt 或 raw transcript。

## 驗收條件

- [x] `GET /api/agents/detect` 回傳 canonical agents detection snapshot，失敗時只回 sanitized error，不暴露 secrets 或 raw command。
- [x] CLI Agents 頁可按「重新偵測」並顯示 connected/offline、path、version summary 與 checked time。
- [x] Settings 可設定 daily scheduler enabled 與 run time，並透過 `PATCH /api/settings` 持久化。
- [x] `GET /api/scheduler/daily` 回傳 scheduler enabled/run time/last run state。
- [x] `POST /api/scheduler/daily/run` 可手動產生當日 global daily log 與 project AI drafts，重跑不覆蓋 user summary override。
- [x] Scheduler automatic tick 只在 enabled 且到達 run time 後每日跑一次，重複 tick 會 skip。
- [x] Core tests、Core typecheck、UI tests、Build、API smoke、desktop/mobile UI screenshot 均 PASS。
