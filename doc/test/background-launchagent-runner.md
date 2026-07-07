# Background LaunchAgent Runner Test Plan

## Test Depth Route

- Level: 3
- Reason: 背景程序與 LaunchAgent 會跨 Core settings、SQLite persistence、scan provider、AI diary generation、Tauri packaged startup 與 shell launch path。
- Required verification: Core tests、typecheck、Rust check/build、script syntax、plist lint、safe `--once` runtime smoke、diff review。
- Allowed skips: 這輪不改 React UI，桌面/手機 RWD 截圖可跳過；長時間 LaunchAgent soak test 留待使用者本機安裝後觀察。

## Bug Pattern Coverage

- [x] Input normalization / aliases / format variants：LaunchAgent script 只接受固定 subcommands。
- [x] Boundary values / empty / null / malformed input：settings 預設與 disabled state。
- [x] Rule priority conflicts：`daily_scheduler.enabled` 控制背景流程是否執行，`scan_interval_minutes` 控制 scan interval，`daily_scheduler.run_time_local` 控制 diary time。
- [x] Negation / exclusion / opt-out / unlimited：disabled 時不可 scan 或寫 diary。
- [x] Contract generated and execution applied：scan result 必須在 diary generation 前執行。
- [x] Operation order invariants：scan 每輪執行；diary 只在 daily guard 通過時接著執行並更新 scheduler state。
- [x] Production-like dirty data：使用 persistent settings/runtime defaults，mock provider 只在測試注入。
- [x] Multi-condition combinations：enabled + interval + run time + already-ran state + scan provider + diary agent fallback。
- [x] Security bypass mixed with normal input：LaunchAgent 不接受任意 command/path，使用固定 repo launcher。
- [x] State/history/retry/refresh behavior：下一輪讀最新 interval；daily success 後同日後續 scan 不重跑 diary；單次 smoke 可重複執行。
- [x] Externally observable result, not only implementation detail：`background:once` 寫入 SQLite 並輸出 sanitized JSON result。

## Runtime Verification Route

- Runtime smoke: REQUIRED
- Black-box QA: OPTIONAL，背景 CLI/LaunchAgent surface 為主，無 UI workflow 變更。
- Safe environment or localhost command: temp SQLite + mock scan provider；不使用 production secrets。
- Safe test account / mock access: deterministic fallback / injected mock agents。
- Forbidden or destructive actions: 不寫 project folders、不 commit、不刪 user data、不輸出 raw token/secrets。

## [x] 【function 邏輯】enabled cycle 到 daily run time 時先 scan 再寫 AI diary
**範例輸入**：in-memory SQLite、seed projects、`daily_scheduler.enabled=true`、`run_time_local` 已到、mock scan provider、mock diary agents。
**期待輸出**：cycle `status=success`、scan 有結果、daily log 更新、project drafts 更新、scheduler last status 為 success。

## [x] 【狀態回歸】enabled cycle 未到 daily run time 時只 scan 不寫 AI diary
**範例輸入**：`daily_scheduler.enabled=true`、`run_time_local` 尚未到、mock scan provider、mock diary agents。
**期待輸出**：cycle `status=success`、scan 有結果、diary `status=skipped`，不更新 scheduler last success。

## [x] 【狀態回歸】同一天已成功寫 diary 後，後續 interval 只 scan 不重跑 AI diary
**範例輸入**：先跑一輪 daily success，再於同日下一個 scan interval 跑第二輪。
**期待輸出**：第二輪 scan 成功，但 diary `status=skipped` / already ran，不新增 AI diary draft 呼叫。

## [x] 【狀態回歸】disabled cycle 不掃描也不寫 diary
**範例輸入**：default settings 或 `daily_scheduler.enabled=false`。
**期待輸出**：cycle `status=skipped`、message 指出 disabled、sessions/daily logs 不新增背景結果。

## [x] 【資料邊界】interval 由 settings 決定且有安全下限
**範例輸入**：`scan_interval_minutes=5`、`scan_interval_minutes=120`。
**期待輸出**：runner delay 分別為 5 分鐘與 120 分鐘，不需要重裝 LaunchAgent。

## [x] 【安全繞過】LaunchAgent 管理腳本固定啟動 repo launcher
**範例輸入**：執行 `bash -n` 與產生 plist 後 `plutil -lint`。
**期待輸出**：語法與 plist 均有效；plist `ProgramArguments` 指向固定 shell + launcher + `run`；在 `$HOME` 位於 noowners DataDrive 時，實體 plist 放在內建磁碟專案 `.launchagents/`，`~/Library/LaunchAgents` 只放 symlink。

## [x] 【整合流程】packaged app startup 自動安裝 LaunchAgent
**範例輸入**：Tauri app startup 可 resolve bundled `core` resource。
**期待輸出**：app 寫入 app data launcher / LaunchAgent plist，`launchctl bootstrap` 指向 packaged Core resource，不需要使用者手動跑 npm script。

## [x] 【整合流程】safe once smoke 完成 scan + diary
**範例輸入**：`HOME=<temp home> DEVDIARY_DB=<temp sqlite> npm run background:once -- --seed-if-empty --enable-for-smoke`。
**期待輸出**：CLI exit 0，stdout JSON `status=success`，temp DB 有當日 daily log。
