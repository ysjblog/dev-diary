# 背景 session 搜尋期限修復驗證（2026-09-18）

## 結果與使用者影響
原註冊保留；修復版已安裝並重新啟動。真實背景服務自行把同一目標從需要處理恢復成監看，清除身分未完成錯誤。全域與目標開關保持啟用；無額度證據、claim、attempt、送出階段或完成證據。沒有送出 Codex 訊息，沒有中斷 Codex。

## 根因與修復
真實背景診斷兩次命中 scan_deadline，而前景同資料驗證成功。前景預設仍為 5 秒，背景監看與恢復驗證使用上限 30 秒；非法期限拒絕。每次走訪、掃描完成及完整 snapshot／雜湊／時區權威驗證完成都檢查期限。同步磁碟操作不能即時中斷，但返回後若超時，結果不會成為有效身分證明。唯一性、canonical root/store、symlink、檔案身分與 prefix 檢查不變。

## 修復候選與審查
- 候選：6d55c34-b91642a7395b。
- 契約矩陣：1d26c91e1d68b813eeb1bbef622d36b3ef3b6f458ec60d8e44ab947a91a20f46。
- lookup SHA256：bb330f6e8c31807b855b5885bcf43ab38c7094b2209ad20f86122ffad975b971。
- engine SHA256：83f44b6ee2616b2adbb562798f8f2407e12e7d6819d800ef5838d7c9d98bd513。
- 初審發現最後一次讀取跨期限仍可能回傳證明；一次修正加紅／綠測試後，fresh final review APPROVE。兩個 mandatory lenses 通過；review router complete。
- Core 全部 336 tests 與 typecheck 通過；UI/API 82 tests、UI build 通過。
- 獨立 reviewer 使用 Node 22.23.1、全新 temp sessions/SQLite 自行執行 11 項情境；另完整讀取跨 5 秒期限情境通過，共 12 項。
- 實際耗時：前景 5.628 秒拒絕、背景 6.453 秒成功、最後 I/O 30.106 秒拒絕、engine 慢搜尋 12.898 秒恢復監看。
- 7 種非法期限、錯 inode、跨 root、跨 store、symlink 拒絕；fake dispatcher 0，temp DB 無 claim/attempt/action/lease，來源 SHA 前後一致。

## 安裝與真實背景驗證
- DMG 重新打包成功；簽章驗證通過。DMG SHA256：4c00347df35a5a64b11bb1f3159a1d5efd1cf8028074e553445d28039c7304c0。
- 安裝來源為最終 DMG；兩個 installed source SHA 與候選完全一致。舊 app 另存可還原，SQLite 另外備份；不刪除註冊資料。
- 安裝前先暫停全域開關，確認無進行中動作；退出 DevDiary、停止其背景服務、更換 app，再啟動 Core 與背景服務。
- installed engine 在真實資料庫的備份上使用 fake dispatcher：watching、last_error null、dispatch 0、無證據／attempt／action。
- 重新啟用後，真實背景服務自行恢復 watching；原 registered_at_ms 1789708018103 未變。恢復 updated_at_ms 1789710196241。全域 revision 11、enabled true、action_in_progress false。
- 間隔超過一個 30 秒背景檢查週期的兩次觀察均維持 watching、last_error null，沒有證據／claim／attempt／action；背景服務持續 running。
- 獨立 11 項原始結果另存 `codex-resume-background-deadline-independent-results.json`。
- Core 以 verified manifest 綁定 localhost 4317、API contract 8；LaunchAgent running。

## 範圍與限制
本次未改 UI，UI capture 略過。真實額度恢復後的 CLI 送出尚未執行，本紀錄不把監看成功當成真實續跑成功。保留既有大量 WIP，未 commit、merge、push 或發布。
