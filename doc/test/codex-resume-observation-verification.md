# 續跑自動蒐證驗證

本次僅新增本機診斷觀察，不改訊息內容、派送條件、重送規則、Codex App 或 UI。與目前安裝版相比，Core runtime 差異只有 backgroundRunner.ts 與兩個新 observation 模組。原有工作區變更不可分離，因此不 commit；未 push／對外發佈。

## 結果

- General 本機觀察增量，測試深度 Level 4。
- 16 項 observation 測試通過；完整 Core 425／39 files 通過，UI82通過。
- Typecheck／production build／diff check 通過；未設定 lint script，略過。
- Owner獨立程序 smoke 通過：restart、start、timeout、privacy、no replay。
- 真實唯讀worker可取得程序與Desktop統計，沒有傳送訊息或寫入Codex資料；證據 `codex-resume-observation-live-snapshot.json`。
- 獨立QA曾發現deadline後開始誤判，已依實測修復並補 exact/+1ms 回歸；修正後獨立QA25/25通過，三個runtime候選hash相符。

## Security

來源：已註冊任務locator、私人session/log與程序名稱。輸出：固定欄位JSON。所有來源解析在限時worker內，拒絕越界／symlink／非regular檔案；僅傳出數值、digest、固定enum。spawn無shell且固定argv，不讀環境變數或程序命令列。落盤原子替換、0600、有筆數／容量上限，拒絕既有symlink/hardlink。人工sentinel／原始錯誤／UUID／來源路徑測試均未出現在輸出。診斷異常不重送、不變更續跑DB；固定stderr警告可追查不可用情況。

## 限制

- 正常排程每30秒檢查，但忙碌與輪替會延後快照；期限後開始不能算期限內成功。
- 最多同時32筆觀察；超出只警告且略過診斷，原派送繼續。
- 最新100筆覆蓋較舊已結束紀錄；單檔上限256KiB，磁碟故障仍可能無法保存並輸出固定警告。
- source換檔／截斷／追加超過1MiB時判定無法確認，不猜開始。
- 日誌為有限尾端的App整體統計，不能代表完整歷史或直接證明某任務故障原因。
- 新執行證據不代表任務完成，也不證明與本次訊息的因果關係。
- 不回補安裝前的要求；整體無人操作可靠性仍待真實下一次額度恢復驗證。


## Installed verification

- 已備份舊App、SQLite，暫停派送後替換；原監看開關恢復，registration時間保持不變。
- codesign deep/strict及安裝來源hash通過；background launchagent running。
- 新診斷 observations.json 已建立，0600、0筆；沒有寫入合成事件至真實診斷檔。
- 已安裝模組加bundled Node22的隔離smoke通過restart/start/timeout/privacy/no replay。
- 證據：codex-resume-observation-installed.json、codex-resume-observation-installed-smoke.json、codex-resume-observation-package.json。
- 初次啟動檢查曾早於LaunchAgent完成重啟；後續確認running且檔案存在，不以bootstrap接受代替執行證據。

VERIFICATION REPORT
Revision: candidate file hashes in codex-resume-observation-candidate.json; HEAD unchanged
Target: local resume diagnostics, installed DevDiary
TestDepth: PASS (Level 4; Core425, UI82, independent25)
Build: PASS
Types: PASS
Lint: SKIPPED (no configured script)
Security: PASS (bounded fixture and source-to-sink checks; filesystem races remain untested)
Smoke: PASS (source and installed isolated runtime)
BlackBoxQA: PASS (25/25, final candidate)
Diff: REVIEWED (preserved preexisting WIP; no commit)
Overall: READY for this diagnostic increment; unattended resume reliability remains unproven
