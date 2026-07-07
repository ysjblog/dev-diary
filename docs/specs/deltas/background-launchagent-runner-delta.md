# Delta Spec: Background LaunchAgent Runner
> PR: feature/core-engine
> Date: 2026-07-05
> Status: implemented

## 新增（Added）

- Core background runner：可在沒有開啟 Tauri/macOS app 視窗時，讀取 persistent SQLite settings，依 `scan_interval_minutes` 週期執行 project scan / log parse / session persistence；AI diary generation 只在 `daily_scheduler.enabled` 且到達 `daily_scheduler.run_time_local` 且當天尚未成功執行時才跑。
- macOS per-user LaunchAgent 管理腳本：安裝、卸載、查狀態與安全手動 run-now，LaunchAgent 只啟動 repo 內固定 launcher，不接受任意 command。
- Tauri packaged app startup 會自動安裝 / 更新 per-user LaunchAgent，讓使用者在別台電腦安裝並開啟 app 後，不需手動跑 `npm run background:install`。
- Background runner CLI：支援 `run` 長跑模式與 `once` 單次 smoke/test 模式。
- `doc/test/background-launchagent-runner.md`：記錄測試深度、風險、驗收與手動驗證流程。

## 修改（Changed）

- 既有 Core in-app daily scheduler 仍保留給 app 開啟時使用；新增背景 runner 會在 LaunchAgent 啟動後直接呼叫 Core service，不依賴 Local HTTP API 或 Tauri process。
- `scan_interval_minutes` 成為背景 runner 的掃描輪詢間隔來源；`daily_scheduler.run_time_local` 成為每日 AI diary 產生時間來源。
- `daily_scheduler.enabled=false` 時背景 runner 不進行 scan 或 diary；enabled 後 scan 可依 interval 多次執行，但 diary 每天最多成功一次。
- `package.json` 新增 background runner 與 LaunchAgent 管理 scripts。
- `docs/specs/MASTER.md` 需更新 OS-level catch-up / app closed background behavior / packaged app auto-install 現況。

## 移除（Removed）

- 無。

## 影響範圍（Impact）

- Core services：新增 background runner orchestration，重用 `runManualScan`、`DailySchedulerRuntime`、Settings、scan provider 與 diary agent。
- macOS runtime：新增 `~/Library/LaunchAgents/com.devdiary.app.background.plist` 安裝路徑與 app data log files；packaged app 會在 startup 寫入固定 launcher script 與 plist。
- 安全邊界：背景 runner 只寫 app-owned SQLite；project folders 仍 read-only；LaunchAgent 不讀 secrets、不輸出 token、不接受 UI/user supplied shell command；packaged launcher 只使用 app resolved resource path 與 app data path。

## 驗收條件

- [x] `runBackgroundCycle` 在 scheduler enabled 時每輪先執行 global scan；只有到 daily run time 且當天尚未 success 時才寫 daily log / project AI drafts。
- [x] scheduler disabled 時 background cycle 只回報 skipped，不掃描、不寫 diary。
- [x] background runner 每輪讀取最新 `scan_interval_minutes`，不用重裝 LaunchAgent 即可套用下一輪間隔。
- [x] LaunchAgent plist 由固定 launcher 啟動，通過 `plutil -lint`，管理腳本可 `install|uninstall|status|run-now`。
- [x] `npm run background:once` 可在安全 temp DB runtime 完成一次 scan + diary smoke。
- [x] Tauri packaged app startup 會自動安裝 / 更新 LaunchAgent，plist 指向 packaged Core resource，不依賴 dev repo path 或 npm script。
- [x] Core tests、Core typecheck、UI build、script syntax check、diff check 均 PASS。
