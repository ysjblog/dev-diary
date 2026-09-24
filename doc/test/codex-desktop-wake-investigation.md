# 未載入任務喚醒調查

2026-09-21，唯讀產品程式碼檢查與單次任務連結開啟測試。

- Installed Codex bundle id: com.openai.codex; version 26.915.31945; URL scheme codex.
- `codex app` only accepts workspace path; `queue` has no load/wake flag.
- Default `app-server daemon version` cannot connect because its default control socket does not exist. This does not prove Desktop has no internal server; it only rules out the default public daemon endpoint as currently configured.
- Installed deep-link handler accepts `codex://threads/<UUID>`, reads the exact thread and navigates to its local route. Normal task links ensure the primary window is visible. A browserActive=false special case is restricted to browser backfill; it does not navigate/load a thread and must not be repurposed for wake.
- A registered failed target with zero queued items was opened once using macOS open bound to bundle id. Desktop log recorded exact local route and active view. Latest turn id/status unchanged; no new message was submitted. Restored Owner task afterward.
- Both registered targets were already loaded during this probe; one systemError and one active. Therefore the probe proves exact-link navigation, NOT cold-load activation or queued-message consumption.

## Decision boundary
A possible foreground-assisted design is queue receipt -> open exact registered task link -> observe actual task-start evidence, with no resend for missing start. It changes the visible Codex task and requires integration review and a controlled unloaded-target runtime check before being installed. Current installed DevDiary is unchanged. Existing no private socket/raw server/composer injection restrictions remain.

## Remaining evidence
Controlled unloaded task with exactly one known queued item; prove one turn begins, no duplicate input, and identify foreground side effects. Cannot reuse the already-loaded-target navigation result as that evidence.

## 2026-09-22 接續調查

使用者回報：送出「繼續」進入佇列後，Desktop 未切換到該任務時似乎不會開始。

本輪唯讀核對：

- 安裝版 DevDiary 的 `codexQuotaEvidence.ts`、`codexDesktopResumeEngine.ts` 與工作區 SHA-256 相同；前輪修復仍在安裝版中。
- 真實資料庫的兩個註冊目標均為 `resumed` 且無 error。此狀態只表示要求已送出，UI 也顯示「已送出續跑要求」；不能推論開始或完成。
- dispatcher 在收到正確 queue receipt 後回傳 `accepted: true, code: queued`，沒有開啟 deep link 或觀察 task start。
- 本機 Codex 26.915.31945（build 9922）的主程序 `QEe` 將 `queuedMessages.automaticExecutionEnabled` 設為 false。
- 同版 renderer 的 `_0t` 以 `isClientReady = active && automaticExecutionEnabled && isHostForConversation(...)` 決定是否能處理佇列；`xhn` 提供 renderer 的執行與 ownership 設定。這證明存在 client readiness 條件，尚不能推論所有非前景任務必定不執行。
- renderer artifact: `webview/assets/app-initial-a498f911edeb.js`；SHA-256 `34a75db63c7137eb4caecdba1f36d631c10c7912487e532fd5e9dafb175bb9be`。

### 根因界線與可評估修法

已證明 DevDiary 把訊息交入佇列後沒有負責讓目標 client ready；使用者的視窗切換觀察與此缺口一致。未載入任務的對照實測仍缺，不能宣稱前景切換已修復或背景必定無法執行。

建議評估：固定訊息只送一次，確認 receipt 後開啟 exact registered task deep link，再以新 turn 的實際開始證據確認啟動。開啟失敗或開始逾時都保留已消耗證據，不再補送訊息。既有已送出目標不因升級自動重播。

此方案會改變使用者正在看的 Codex 任務，且改變現有無視窗依賴契約；已詢問是否接受，尚未收到決定。若選擇保留畫面，需另查受支援的背景載入途徑；目前沒有已驗證可用的途徑。

本輪未送真實訊息、未切換任務、未改註冊或安裝內容。實作前須更新既有 Change，完成整合授權／失敗恢復審查；安裝前須取得未載入目標、單一 queued item、一次新 turn、無重複輸入的受控 runtime 證據。

## 2026-09-23 延遲根因追查

本輪只讀，沒有送出訊息、重開任務、修改電源設定或重啟 Codex。

- `pmset -g custom`：AC power `sleep=0`、`displaysleep=10`；不能將此延遲歸因為設定了整機自動睡眠。
- 09-22 16:42:17 +08：exact target active=true、visible=true、focused=true，Desktop `maybe_resume_started`。證明已安裝的 navigation 生效。
- 16:42–16:44：在途請求5–6筆，permissionProfile/list、app/read、model/list 排隊逾時；configRequirements/read、experimentalFeature/list 出現 timeout。
- 16:44:53：thread/resume 的 critical request 排隊120002ms後被拒絕；這不是 queue receipt 或 deep-link identity 錯誤。
- 09-23 00:33:08：先前 experimentalFeature/list（43386404ms）、configRequirements/read（43380054ms及28250176ms）集中返回；隨後新同類讀取只需數毫秒，thread/resume 成功。
- 顯示器12:33:12關閉，00:32:19重新開啟，與大量請求恢復高度相關；仍無因果證明，不把screen-off、lock、App Nap或網路中任一項當作已證實根因。
- 已安裝 Codex 的 `setSystemFocusState` 在系統suspend或screen-lock時抑制視窗焦點事件；`syncPowerSaveBlocker` 視活動集合啟用 prevent-app-suspension／prevent-display-sleep。這只證明產品有相關機制，不能证明此次哪一機制阻塞請求；未修改vendor bundle。

下一個最小判別：經使用者同意後做約一分鐘screen-on/off/短暫wake唯讀對照，不傳訊息、不解鎖、不永久改pmset。比較正式read工具時間、Desktop request queue與返回時間。暫時關閉螢幕會影響使用者，已提出非同步確認，未回答前不執行。

## 2026-09-23 螢幕開關對照結果

使用者明確授權後，以本機man page確認caffeinate -u -t 5的短暫喚亮用途；獨立程序finally安排喚亮。00:55:36要求螢幕關閉，系統log確認；00:56:21喚亮，00:56:26程序完成。未改永久pmset、未解鎖、未傳訊息。

螢幕關閉時正式read_thread在167ms返回；額度唯讀查詢927ms返回。Desktop log的thread/read在0–36ms、account/rateLimits/read在802ms完成，沒有重現佇列停滯。此時仍有Codex工作執行中，因此不能外推到長時間完全閒置狀態。

歷史09-22 17:00至23:59各小時只有queue rejection（15/18/24/19/34/16/14筆），沒有response_routed；凌晨00:33集中恢復。已證明的故障邊界是Desktop app-server request停滯／佇列飽和，非單纯未切換頁面。造成長時間未回應的更深原因尚未證明。安裝包讀取顯示requestScheduler管理在途與排隊；不能因片段程式碼推定修改vendor timeout即可修好。

決定：保留已驗證的queue後exact-link修復與no-replay；不加入沒有因果證據的永久防休眠、不修改vendor bundle、不殺正在工作的Codex、不盲目重送。完整無人操作可靠性仍NOT READY。下一項有效證據需真實閒置且無執行任務時對照；目前有active工作，不為實驗強制中斷。

## 2026-09-23 長時間自然熄屏對照

再次讀取既有系統與 Desktop 日誌，沒有觸發任務或變更設定。系統記錄顯示 01:05:22 熄屏、03:48:12 亮屏，共 2 小時 42 分 50 秒。這段期間 Desktop 完成 33 筆 `configRequirements/read`，每筆 1–2ms，約每五分鐘一次，未觀察到 `request_queue_rejected`。同一讀取方法在前一故障窗口曾延遲數小時，故此結果是同方法的正常對照，不只是不同 API 的成功。

證據：`codex-desktop-long-display-off-20260923.json`。這不能证明期間所有任務均閒置，也不能證明續跑開始；只能排除「單純熄屏必然令此方法停止回應」。系統歷史未找到該窗口的 Entering Sleep/Wake from 紀錄，仍不把未出現紀錄當作所有省電狀態的否定證明。

查閱官方設定與 troubleshooting 文件：防睡眠設定用於正在執行的本機任務；沒有提供此特定佇列停滯的修復方法。官方亦提供日誌位置與回報途徑，要求分享前檢查敏感內容。來源：https://learn.chatgpt.com/docs/reference/settings 、https://learn.chatgpt.com/docs/reference/troubleshooting 。本輪未對外傳送日誌。

目前缺的是故障當下內部程序停滯原因；現況已恢復，無法用健康狀態的取樣代替故障證據。不擴大改動 DevDiary、不新增反覆喚醒或重送，保留既有安裝修復。下一次故障需在重啟／亮屏前取得程序狀態與經去識別的請求時間摘要，再決定修法。整體無人操作可靠性仍未完成。
