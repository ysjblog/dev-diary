# Background LaunchAgent Runner Test Plan

## Test Depth Route

- Level: 3
- Reason: 背景程序與 LaunchAgent 會跨 Core settings、SQLite persistence、scan provider、AI diary generation、Tauri packaged startup 與 shell launch path。
- Required verification: Core tests、typecheck、Rust tests/build、script syntax、plist lint、safe `--once` runtime smoke、external-HOME installed LaunchAgent smoke、diff/security review。
- Allowed skips: 這輪不改 React UI，桌面/手機 RWD 截圖可跳過；長時間 LaunchAgent soak test 留待安裝後觀察。

## Bug Pattern Coverage

- [x] Input normalization / aliases / format variants：LaunchAgent script 只接受固定 subcommands。
- [x] Boundary values / empty / null / malformed input：settings 預設與 disabled state。
- [x] Rule priority conflicts：`daily_scheduler.enabled` 控制背景流程是否執行，`scan_interval_minutes` 控制 scan interval，`daily_scheduler.run_time_local` 控制 diary time。
- [x] Negation / exclusion / opt-out / unlimited：disabled 時不可 scan 或寫 diary。
- [x] Contract generated and execution applied：packaged path 必須由實際 App startup 產生可被 `launchd` 執行的 registration；不能只驗證 path 字串與 plist lint。
- [x] Operation order invariants：scan 每輪執行；diary 只在 daily guard 通過時接著執行並更新 scheduler state。
- [x] Production-like dirty data：HOME 位於 `noowners` 外接 APFS，而 packaged App 位於本機 `/Applications`。
- [x] Multi-condition combinations：enabled + interval + run time + already-ran state + scan provider + diary agent fallback。
- [x] Security bypass mixed with normal input：LaunchAgent 不接受任意 command/path，使用固定 repo launcher。
- [x] State/history/retry/refresh behavior：下一輪讀最新 interval；daily success 後同日後續 scan 不重跑 diary；單次 smoke 可重複執行。
- [x] Externally observable result, not only implementation detail：`background:once` 寫入 SQLite 並輸出 sanitized JSON result。
- [x] Filesystem stall / timeout：外接磁碟單一路徑若卡在讀目錄，探索必須在每個 root 的期限內返回，並把該 root 視為不完整觀察；不可誤標專案遺失、不可拖過租約造成重複執行。
- [x] Whole-scan isolation：CLI 日誌或專案文件的任一同步讀檔卡住時，整個 scan child 必須在總期限內被終止；Core 心跳與 health/settings 仍可回應。
- [x] Per-file degradation：未命中 cache 的單一 CLI 日誌或專案文件若讀取超過 2 秒，跳過該檔並回傳 sanitized warning；不得洩漏原始內容或讓其他專案停止。
- [x] Explicit AI boundary：Scan Now 只做有界本機匯入，不暗中逐專案呼叫 Kanban AI；AI Kanban 僅由每日排程或明確 per-project AI sync 動作執行。

## Runtime Verification Route

- Runtime smoke: REQUIRED
- Black-box QA: REQUIRED，背景服務是否真的註冊與執行屬外部可觀察的關鍵 runtime path。
- Safe environment or localhost command: temp SQLite + mock scan provider；以及已授權本機 App 安裝後的 read-only service/health/settings/SQLite checks，不輸出 private content。
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

## [x] 【安全繞過】LaunchAgent 管理腳本固定啟動可信 launcher
**範例輸入**：執行 `bash -n` 與產生 plist 後 `plutil -lint`。
**期待輸出**：語法與 plist 均有效；plist `ProgramArguments` 指向固定 shell + launcher + `run`；development 實體檔放 app data，packaged App 實體檔放固定 `.app` sibling，`~/Library/LaunchAgents` 只放 owned symlink。

## [x] 【整合流程】packaged App startup 在 external HOME 自動安裝 LaunchAgent
**範例輸入**：Tauri App 位於 `/Applications`、bundled Core 可解析、HOME 位於 `noowners` 外接 APFS。
**期待輸出**：App 在本機 `.DevDiaryLaunchAgents` sibling 產生 launcher/plist，registration 指向該來源，`launchctl print` 顯示服務存在且 launcher 指向 packaged Core，不需要手動跑 npm script。

## [x] 【狀態回歸】packaged UI 不與 LaunchAgent 重複啟動 startup scan
**範例輸入**：packaged Tauri runtime 已連上 Core、project roots 已設定、LaunchAgent 將在獨立 process 執行背景掃描。
**期待輸出**：UI 不呼叫 startup global scan，Core health/settings 保持可回應；Web development runtime 仍可執行一次既有 auto scan，手動 Scan Now 不變。

## [x] 【錯誤處理】來源 plist 驗證或 bootstrap 失敗不破壞無關 registration
**範例輸入**：invalid candidate；或 registration 在失敗清理前被換成另一個 target。
**期待輸出**：stable source/無關 registration 保留，僅刪除本次 exact link，錯誤寫入 sanitized core log。

## [x] 【整合流程】safe once smoke 完成 scan + diary
**範例輸入**：`HOME=<temp home> DEVDIARY_DB=<temp sqlite> npm run background:once -- --seed-if-empty --enable-for-smoke`。
**期待輸出**：CLI exit 0，stdout JSON `status=success`，temp DB 有當日 daily log。

## [x] 【錯誤處理】外接磁碟 root 卡住時有限時且不誤清理
**範例輸入**：測試 worker 永不返回、單 root timeout 設為 50ms、該 root 先前已有一個專案後路徑消失。
**期待輸出**：discovery 回報 incomplete root；reconciliation 回報 skipped，missing counter 維持 0；整個測試在 2 秒內結束。

## [x] 【錯誤處理】整輪掃描子程序逾時不拖死 Core
**範例輸入**：scan worker 永不返回、總期限設為 75ms。
**期待輸出**：父程序在 2 秒內以 `scan_timeout` 結束 child；Core heartbeat timer 可繼續執行，API 將回傳明確失敗而不是永久 pending。
