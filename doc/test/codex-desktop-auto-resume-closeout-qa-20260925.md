# Codex Desktop 多任務額度恢復續跑：Closeout 獨立黑箱 QA 報告（2026-09-25）

## 結論

PASS。獨立 Worker（cold-started subagent，未修改任何 source / spec / README）對 `codex/fix-resume-session-lookup` branch 的 Settings > Automation 多 target 管理 UI 與 Core API 完成 11 項驗收項目的 black-box 驗證，全程對隔離環境操作，真實已安裝 DevDiary（Core port 4317, pid 92774）全程未被觸碰。全程使用 fake UUID（`0190abcd-ef00-7000-8000-00000000aa01/02/03`）、fake home、隔離 Core（port 4417）與隔離 Vite（port 5184）；沒有跑真實 `codex` CLI，沒有跑 `backgroundRunner`（resume/dispatch engine），沒有讀寫真實 `~/.codex` 或 `~/Library/Application Support/DevDiary`。

## 隔離證明

| 檢查 | 結果 |
|---|---|
| 隔離 Core `/api/health`（經 Vite proxy `http://localhost:5184`） | `pid=30401 port=4417`（與隔離 Core 直連一致） |
| 隔離 Core `/api/health`（直連 `http://127.0.0.1:4417`） | `pid=30401 port=4417` |
| 真實 Core `/api/health`（`http://127.0.0.1:4317`） | `pid=92774 port=4317`，QA 全程未變動 |
| `DEVDIARY_DB` | `/tmp/devdiary-qa.rUSF/qa.sqlite`（設定頁 Data storage path 欄位亦顯示同一路徑，UI 端二次確認） |
| `DEVDIARY_CORE_MANIFEST` | `/tmp/devdiary-qa.rUSF/core-runtime.json` |
| `HOME`（Core + Vite 共用） | `/tmp/devdiary-qa.rUSF/home` |

備註：本機環境下 Vite/Node 綁定的是 IPv6 `localhost` 而非 IPv4 `127.0.0.1`，因此 `curl http://127.0.0.1:5184` 會 connection refused，需改用 `curl http://localhost:5184`；這是環境特性，不是本次驗證的缺陷。另外 `vite.config.js` 有 `server.open: true`，啟動隔離 Vite 時會自動彈出一個真實 Chrome 視窗指向 `localhost:5184`（仍只指向隔離 stack），此為透明揭露而非問題。

## 驗證結果（11 項驗收）

| # | 檢查項目 | 結果 | Fresh evidence |
|---|---|---|---|
| 1 | Automation 分頁渲染 Codex target 區塊 + 已驗證 runtime 狀態 | PASS | overview card 顯示「Core runtime 已連線」，PORT `127.0.0.1:4417`、CONTRACT `v8` |
| 2 | 透過 deep link + 顯示名稱註冊 target，出現在列表 | PASS | `rows=1`；列出 "Target One \| 監看中 \| 暫停 \| 重新命名 \| 註銷" |
| 3 | 註冊第二個 target，兩者皆列出 | PASS | `rows=2`；`names=["Target One","Target Two"]` |
| 4a | 格式錯誤 deep link 被拒絕，不建立新列 | PASS | `rows_after=2`（不變）；toast「Codex Desktop 續跑註冊失敗：Codex Desktop 續跑資料格式無效。」 |
| 4b | 重複 UUID 被拒絕，不建立新列 | PASS | `rows_after=2`（不變）；toast「Codex Desktop 續跑註冊失敗：這個 Codex 任務已註冊。」 |
| 5 | 重新命名 target，reload 後仍保留 | PASS | rename 後與 reload 後皆為 `["Renamed Target One","Target Two"]` |
| 6 | 單一 target 暫停／繼續，另一個不受影響，reload 後仍保留 | PASS | t1: 暫停→繼續監看，reload 後仍是「繼續監看」；t2 全程維持「暫停」，reload 後仍是「暫停」 |
| 7 | 全域暫停反映在 UI 與 API，重新啟用可運作 | PASS | UI 文案「全域監看已暫停」/「全域監看已啟用」與 API `codex_desktop_resume.enabled=false/true` 一致 |
| 8 | 註銷從列表與 API 移除；fake home `.codex` fixture 不受影響 | PASS | `rows 3→2`；API target 列表不再含 aa02；`home/.codex/sessions/` SHA-256 前後一致（`5ac2527...f437667` = `5ac2527...f437667`）——範圍限定在 session fixture 檔案本身，見下方「殘餘邊界」 |
| 9 | 狀態／reset／錯誤顯示（seeded `waiting_for_reset` / `needs_attention`） | PASS | 直接以 `sqlite3` 在隔離 DB seed aa01→`waiting_for_reset`(+`reset_at_ms`)、aa03→`needs_attention`(+`last_error_code='qa_fixture_forced_error'`)；UI 顯示「等待額度恢復（09/25 下午12:07）」與「需要人工檢查（qa_fixture_forced_error）」 |
| 10 | 舊／過期 runtime fail closed | PASS | Playwright `page.route` 攔截 `/api/health`，強制 `api_contract_version=7` 並移除 capability `codex.desktop-resume.multi-target-v2`；UI 顯示「Core runtime 可能過舊」「CONTRACT v7」「缺少 capabilities」；全域開關、deep link/名稱輸入框、註冊鍵、全部 6 個 target 按鈕皆 `disabled=true`；對已停用控制項強制點擊（`force:true`）後，`/api/codex/desktop-resume` 的 mutation 請求數為 0 |
| 11 | Core mutation route 拒絕跨來源請求 | PASS | `curl -X PATCH ... -H "Origin: http://evil.example"` 回 `403 {"error":"forbidden_origin",...}`；嘗試把 `enabled` 翻成 `false` 未生效（維持 `true`）；同樣偽造 Origin 對真實存在的 target 送 `DELETE` 也回 `403`，該 target 事後確認仍存在 |

## Commands and counts

- Node 版本切換：`export PATH=/opt/homebrew/opt/node@22/bin:$PATH`
- 隔離 Core 啟動：`DEVDIARY_PORT=4417 DEVDIARY_DB="$QA/qa.sqlite" DEVDIARY_CORE_MANIFEST="$QA/core-runtime.json" HOME="$QA/home" DEVDIARY_DEV_BROWSER_ORIGINS="http://localhost:5184,http://127.0.0.1:5184" node --import tsx/esm core/src/index.ts`（實際透過專案內 `tsx` bin 啟動，pid 30399→30401）
- 隔離 Vite 啟動：`HOME="$QA/home" DEVDIARY_CORE_MANIFEST="$QA/core-runtime.json" node node_modules/vite/bin/vite.js --port 5184 --strictPort`（pid 30504）
- UI 自動化：Playwright Node API（既有全域 npm 安裝，透過 `NODE_PATH` 解析），瀏覽器執行檔改指向既有快取的 `chromium-1223`「Google Chrome for Testing」（未下載任何新套件／瀏覽器），viewport 1280×820，headless
- Item 8 hash：`sha256` 對 `home/.codex/sessions/` 目錄下所有檔案內容 + 相對路徑做前後比對
- Item 9 seed：`sqlite3 "$QA/qa.sqlite" "UPDATE codex_desktop_resume_targets SET state=... WHERE thread_id=...;"`（`snapshot()` 直接讀 DB，不需要跑 backgroundRunner）
- Item 10：`page.route('**/api/health', ...)` 篡改回應後即時渲染判定；並以 `page.on('request', ...)` 監看是否有 mutation 請求送達
- Item 11：`curl -i -X PATCH/DELETE http://127.0.0.1:4417/api/codex/desktop-resume[...] -H "Origin: http://evil.example"`

## Non-functional

- **Page errors**：全程 0 個未捕捉例外。
- **Console errors**：記錄到 2 筆，皆為瀏覽器自動記錄 item 4a/4b 兩個「刻意觸發」的 400／409 HTTP 回應（格式錯誤 deep link、重複 UUID），屬於負向測試的預期行為，非程式缺陷。

## 殘餘邊界（Residual boundary）

- Item 8 的雜湊比對範圍限定在 `home/.codex/sessions/`（實際用於 registration 比對的 fixture 證據檔案），而非整個 `.codex` 樹。原因：獨立驗證發現，即使完全不做任何 mutation，單純導覽到 Automation 分頁就會在 `.codex/tmp/arg0/<random>/.lock` 寫入新的暫存檔——這是 Core 自身的 CLI-agent 偵測／探測機制（onboarding「偵測 CLI Agents」用到的同一套邏輯）在背景執行的既有行為，與「註銷」動作無關，也不是對 session 證據資料的竄改。這屬於觀察到的既有系統行為，記錄於此供 Owner 參考，不在本次任務的 write scope 內修改。
- 本次驗證刻意不執行真實 `codex` CLI、不啟動 `backgroundRunner`（resume/dispatch engine），因此不涵蓋「實際對 Codex 任務送出繼續指令」這條路徑；這是 Work Packet 明訂的安全邊界（避免對真實任務誤送訊息），不是測試涵蓋度的缺口。
- Onboarding wizard（Welcome → Agents → Roots → Scan → Complete）在隔離環境的第一次載入會出現，全程對隔離 fake roots／fake home 操作（唯讀 scan），與本次驗收項目本身無關，但為求 UI 可操作而必須先行完成，已於報告中如實揭露。

## 截圖

- `.claude/screenshots/codex-auto-resume-closeout-qa-01-initial.png` — item 1：Automation 分頁初始渲染，含已驗證 runtime 狀態卡片
- `.claude/screenshots/codex-auto-resume-closeout-qa-two-targets.png` — 兩個已註冊 target 同時顯示（亦為 item 9 的視覺證據：`waiting_for_reset` 與 `needs_attention` 文案）
- `.claude/screenshots/codex-auto-resume-closeout-qa-09-seeded-states.png` — 同上（item 9 專用複本）
- `.claude/screenshots/codex-auto-resume-closeout-qa-10-stale-disabled.png` — item 10：偵測到過舊 runtime 後，全部 mutation 控制項停用

## 完整結構化結果

見同目錄 `codex-desktop-auto-resume-closeout-qa-20260925.json`。
