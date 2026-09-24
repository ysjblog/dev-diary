# Session 註冊搜尋修復

## 原因與範圍
實機 auto roots 是 ~/.codex。舊 lookup 遞迴整個 root，在 .tmp 深度 13 即失敗，JSONL 已讀數為 0。正式活動資料位置為 sessions 與 archived_sessions；外掛、暫存、記憶副本不是活動 session。
本次納入既有 O3 Change，修正唯讀定位、目前 Codex Desktop 的 UUIDv7、Desktop 內附 CLI 優先順序與固定非 Git cwd 參數；不更改登入、帳號授權、固定「繼續」內容或啟用設定。

## Test Depth Route
- Level: 4；定位與 CLI dispatch 同時位於外部寫入前的身分與命令邊界。
- Required verification: lookup/engine/API suites, Core typecheck, UI build, independent runtime QA/security/diff.
- Allowed skips: UI capture（未修改畫面）；真實 dispatch（禁止）。

## Runtime Verification Route
- Runtime smoke: REQUIRED，真實本機唯讀 lookup 與 temp DB API。
- Black-box QA: REQUIRED，獨立 reviewer 使用 temp sessions/DB，禁止真實 dispatch。

## Bug Pattern Coverage
- [x] 正式資料布局與無關深目錄／副本不干擾。
- [x] active/archive 跨目錄重複仍拒絕。
- [x] 缺失、symlink、過深正式資料仍停止。
- [x] locator 保持相對 configured root，背景 consumer 正常。
- [x] 實機唯讀 probe 與 API 可觀察結果。
- [x] 暫時無法證明唯一性時先停止；同一 session 的路徑與檔案身分重新驗證成功、且沒有進行中送出時自動恢復監看。
- [x] 同一 canonical store 內不同起始時間的連續 session segments 選最新者；跨 root、active/archive 並存與相同時間歧義仍拒絕。
- [x] 接受目前 Codex Desktop 產生的 canonical UUIDv7，其他非法 UUID 在 spawn 前拒絕。
- [x] Desktop 內附 CLI 優先於較舊 configured CLI，固定 argv 含 `--skip-git-repo-check` 且不含 sandbox/approval bypass。
- [x] Fake CLI 回報 active-writer、但沒有 `turn.started` 回應時，消耗已 claim 的額度證據、記錄需人工處理，第二次 tick 不再 dispatch。

## [x] 【整合流程】正式 sessions 註冊
**範例輸入**：sessions/target.jsonl，另有 .tmp 深目錄與 memories 副本。
**期待輸出**：唯一正式 session 的 locator；不讀副本、不因深暫存失敗。

## [x] 【安全繞過】活動與封存重複
**範例輸入**：sessions 與 archived_sessions 有相同 metadata UUID。
**期待輸出**：拒絕註冊，零續跑。

## [x] 【暫時錯誤恢復】同一 session 重新可驗證
**範例輸入**：已綁定 session 一次驗證失敗而進入需要處理，之後原路徑、原檔案身分與唯一 UUID 恢復，且沒有 claim、evidence 或送出階段。
**期待輸出**：下一次背景檢查恢復監看；驗證仍失敗、檔案身分不同或已有進行中送出紀錄時維持停止，零續跑。

## [x] 【實機格式回歸】連續 segment 與 UUIDv7
**範例輸入**：同一 UUIDv7 在單一 active store 有兩個不同合法起始時間的 segment。
**期待輸出**：註冊最新 segment；CLI fake receipt 精確包含 UUIDv7 與固定參數，跨 root／跨 store／同時間歧義仍零寫入。

## 背景搜尋期限修復（2026-09-18）
- Test Depth: Level 4；重複出現的外部續跑前身分驗證問題。Runtime smoke 與獨立 Black-box QA 均 REQUIRED；未修改 UI，UI capture 略過。
- 根因：實際 LaunchAgent 診斷兩次顯示 `scan_deadline`；前景以相同資料與環境驗證成功，原本共用 5 秒期限不足以支援背景掃描。
- [x] 前景預設 5 秒搜尋仍有界限；背景允許 30 秒，但不允許任意放寬。
- [x] 超過背景期限仍停止；跨 root、跨 store、symlink 與 identity 檢查不變。
- [x] 身分未完成的已註冊任務能在較慢搜尋完成後恢復監看；fake dispatcher 零呼叫。
- [x] 真實安裝版背景服務自行恢復 `watching`，沒有 claim 或 dispatch。

驗證紀錄：見 `codex-resume-background-deadline-qa-report.md`。同步磁碟讀取必須返回後才能判定超時；完整 snapshot、雜湊與時區權威驗證完成後仍需通過期限檢查。
