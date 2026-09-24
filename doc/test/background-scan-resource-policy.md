# 背景掃描資源分類修復

## ROOT CAUSE DEBUGGING

- Symptom：正式LaunchAgent每次掃描約147秒後報兩分鐘上限逾時，安裝診斷後已連續20次。
- Reproduction：私人SQLite複本＋真實來源唯讀，派送stub不傳Codex訊息；掃描只寫臨時DB。
- Evidence：直接掃描33726ms；正式isolated worker呼叫33907ms；一般launchd一次性job約34秒；加續跑tick的一般程序41176ms；相同掃描使用ProcessType=Background耗時118110ms。
- Suspected cause：正式背景服務的Background資源分類顯著拖慢同步讀檔子程序，與續跑tick同步工作組合後無法在既有上限內交回結果。完整Background/Standard組合對照待補。
- Fix boundary：若組合對照成立，只調整shell與Tauri兩個LaunchAgent產生器的資源分類；維持120秒掃描截止、不改重送／資料／排程契約。
- Local documentation：macOS `man launchd.plist` 的ProcessType說明指出Background有避免干擾使用者的資源限制；Standard等同省略，仍有輕量CPU/I/O限制。不得改成無限制的Interactive。

## Route

General known bug / small local configuration；不改既有API/schema/auth/external-write/production資料契約。Level4：既有重複掃描故障與背景啟動路徑。Security：固定plist enum、固定服務identity/args，沒有新輸入或shell插值。

Runtime smoke REQUIRED：真實launchd、隔離DB與唯讀來源，Background/Standard同樣腳本，清理自己建立的暫時job。
Independent QA REQUIRED：獨立agent以複本腳本重導fixture路徑（不改HOME）與mock launchctl產生／解析plist；不得修改正式服務或呼叫真實launchctl。Owner負責真實runtime。

## Acceptance / Bug Pattern Matrix

- [x] R1 資源分類：Tauri輸出可解析plist，ProcessType=Standard，仍保留相同label/args/RunAtLoad/KeepAlive。
- [x] R2 雙路徑接線：shell install實際產生plist亦為Standard；mock launchctl捕獲同一bootstrap identity，不操作正式HOME。
- [x] R3 Runtime：原Background組合重現逾時，Standard組合在120秒內完成；不以調高截止時間取代修復。
- [x] R4 回歸／安全：Rust全套、介面檢查、bash syntax、build/package、獨立QA與diff；原續跑與蒐證程式不變。
- [x] R5 安裝：保留舊App/DB/plist備份，安裝後真實服務確認Standard，實際背景掃描完成且紀錄可追查。

風險：Standard仍是受限背景服務，但相較Background可能增加CPU/I/O占用；不保證任意數量資料皆能在120秒內完成。完整日記生成是另一個provider工作，不得以掃描成功宣稱日記成功。

## 已確認根因

相同隔離資料庫、相同掃描＋30秒續跑tick：Background在120008ms回報scan_timeout，三次tick出現DB鎖等待；Standard在41760ms完成22個專案。資源分類是此故障的已重現差異。修復只將兩個產生器改為Standard，仍保留輕量資源限制與120秒截止。

測試先紅：shell fixture實際產生Background而非Standard；Rust同項断言失敗。兩個產生器改動後shell通過、Rust24/24與UI83/83、type/build/bash syntax/diff通過。Core source未改，本輪不重跑無關完整Core suite。

## 安裝後驗證（2026-09-24，接手 Owner：Claude Code）

- 10:40–10:43 安裝後首輪真實掃描卡在 `readdirSync("~/Desktop/side-projects")` 的 `open()`；同時段系統日誌有 `sandboxd` 對 `kTCCServiceSystemPolicyDesktopFolder`（macOS 桌面資料夾隱私權限）的授權請求。判定為當時權限詢問尚未回應造成阻塞，與資源分類修復無關。
- 11:00 最小探針：launchd（Standard）直接執行 App 內建 node 讀取同目錄 1 秒完成（20 筆）；同條件 `/bin/bash` 得到 `Operation not permitted`（立即失敗，不會卡住）。
- 11:00 複本資料庫＋launchd Standard＋已安裝程式：34547ms 成功，22 個專案。
- 11:01 已安裝 App 核心 `POST /api/scan`（Scan Now 同一路徑）：33.1 秒成功，22 個專案、新增 3 筆 session，`background_scan.last_status=success`。
- 12:02 排程背景服務（正式 LaunchAgent，ProcessType=Standard）：04:02:25Z→04:03:25Z 成功（約 60 秒），22 個專案、0 警告；原本連續逾時已解除。本輪 daily diary 未到時段、Antigravity 未登入走 fallback，均非本修復範圍。

風險補充：若 macOS 再次跳出「node 想要取用桌面資料夾」的詢問，未回應期間掃描會卡到 120 秒上限；需使用者按「允許」。
