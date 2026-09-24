# 續跑開始觀察與故障蒐證

## 範圍與路由

General：新增本機唯讀診斷，不改 queue/open、觸發條件、lease、API 或 UI 契約；既有 O3 續跑行為維持原樣。診斷不更改 Codex 資料、不傳訊息、不重啟、不自動重送。

## Test Depth Route

- Level: 4；既有重複故障區域，涉及持久化、私人紀錄解析與背景程序。
- Required verification: full Core、type、build、security/diff、Owner fixture runtime smoke、獨立 black-box QA。
- Allowed skips: UI/Rust 無修改；無新 UI 所以本輪不新增 UI gate。
- Runtime smoke: REQUIRED，以臨時 DB/session/log fixture 呼叫真實觀察服務。
- Black-box QA: REQUIRED，獨立唯讀 reviewer 可跑臨時 fixture。
- 不傳送真實 Codex 訊息來製造事件。

## 設計與限制

背景 dispatcher 外包一層觀察器，在送出前保存來源 inode/device/offset；只在同一已註冊 session 的後續完整 JSONL 行看到 event_msg/task_started、有效 turn UUID 與不早於送出時間的 timestamp，才記錄 new_turn_observed。這不證明是此訊息造成、也不證明工作完成。來源換檔、截斷、讀取超限或無法驗證時明確記錄不確定，不能報成功。

觀察期限十分鐘，每次既有30秒tick最多查看兩筆；忙碌、重啟與輪替可能使實際採集晚於期限，但期限後才發生的開始事件不算期限內成功。第33筆pending要求略過新增診斷並留下固定警告，不影響原派送。；重啟後載入未完成觀察。逾時不是任務失敗判定，而是期限內未觀察到開始。額度耗盡後的新一輪要求有獨立紀錄。安裝前已送出的要求不追補。

本機獨立資料夾保存最多100筆紀錄（最多32筆同時觀察），單一檔案最多256KiB，0600，原子替換；僅持久化 target digest、隨機觀察ID、數值時刻、固定狀態、來源位置數值、turn digest及統計。不得保存任務名稱、UUID、來源路徑、原始log、訊息或程序命令列。失敗快照只統計最近兩個實際日誌日期資料夾內最多4個Desktop log尾端中的固定事件，以及固定白名單程序的PID/PPID/狀態；資料不外傳。I/O/worker錯誤只輸出固定診斷警告，不影響原 dispatcher 結果。

## Security Review Route

保護私人 session/log；不信任DB locator、檔案、JSON與程序名稱。所有來源在隔離且限時worker內讀取；拒絕越界、symlink與非regular file，嚴格輸出白名單。持久檔案不跟隨symlink。執行固定ps參數、shell=false，不讀取環境或命令列。測試sentinel不能流入診斷輸出。

## Bug Pattern Coverage / Acceptance

- [x] C1 順序：dispatch前建立baseline，僅追加新task_started確認；既有／過期／response_item內假事件不能誤判。
- [x] C2 狀態：restart恢復pending，deadline恰好到達採集快照；重複tick不重複診斷或重送。
- [x] C3 來源：截斷、換inode、symlink、路徑越界、巨大delta、壞JSON/不完整行均不能報開始。
- [x] C4 隱私：真實worker輸出及落盤沒有session/log sentinel、UUID、路徑、任務名稱或原始錯誤。
- [x] C5 上限：100筆/256KiB、0600、原子替換、來源讀取上限與限時；壞state不能驅動任意讀取。
- [x] C6 隔離：觀察器失敗仍只呼叫dispatcher一次，原結果不變；不更改resume DB。
- [x] C7 接線：background持續tick並包裝production dispatcher；fixture runtime與獨立QA通過。
- [x] C8 安裝：打包、簽章／來源一致、背景程序啟動且診斷檔可寫；不宣稱已發生真實下一次quota恢復。

## Owner execution notes

- Red: 新測試因 observer 模組尚不存在而失敗。
- 第一輪快照 fixture 發現 macOS `/var` 路徑別名被視為越界；根因是比較未正規化 log root，已只正規化受信任根目錄，子目錄仍拒絕 symlink；同類 fixture 通過。
- 第一輪全套在 repo root 啟動，舊 settings fixture 以 cwd 找 tsx 導致 ENOENT；已改由 core 工作目錄搭配 Node22 執行，不修改產品程式碼。
- 開始證據只做時間／來源觀察，無訊息因果關聯或完成宣告。單個 tick 最多查看兩個 pending 來源，避免大量診斷長時間阻塞排程。

- Owner fixture smoke：真實 Node worker，restart/start/timeout/privacy/no-replay 通過。
- 目前 Core422、UI82、Type、Build 通過。UI全套最初揭露前次review-state公開副本的絕對checkout路徑，已把副本根路徑改為相對路徑並標明歷史/去識別；未更改原始暫存receipt，未把它當成本次批准。
- 真實唯讀 snapshot：14個白名單程序、4個日誌尾端，83次response、0次queue rejection；僅當時統計，不是故障重現。

- 獨立QA發現deadline後的新事件在延遲tick被誤算成功；根因是事件上界使用觀察當下now而不是deadline。已取兩者最小值，deadline+1ms拒絕與exact deadline接受的真實worker回歸通過；針對性15/15與fresh smoke/type通過，等待獨立重驗。

- Owner最終安全檢查補上 `sessions/../outside.jsonl` 禁止：僅在home內的containment不足以限制session區，worker現拒絕空／.／.. segment；16項針對測試與fresh smoke通過，獨立重驗與新package進行中。

- 最終獨立QA25/25全新重跑通過，Owner核對三個runtime檔案hash一致；原23項加home內traversal與空/dot路徑。報告 `codex-resume-observation-qa-report.md`。
- 最終全套並行打包時舊customAgents fake CLI probe達3008ms，碰到既有3000ms上限（HTTP400）；單檔原樣重跑6/6於608ms通過。未修改產品timeout；待打包後以降低worker並行度重新確認整套。

## 最終結果

最終候選 Core425/39files、UI82、Type、Build、diff通過；獨立QA25/25通過。套件與安裝版三個runtime檔案hash一致、codesign deep/strict通過。舊App與DB已備份，已安裝新App並恢復原global enabled與兩個註冊任務；背景程序running、診斷檔已建立且0600，初始0筆（不偽造真實要求）。安裝版的隔離smoke重新通過restart/start/timeout/privacy/no-replay。完整無人續跑仍待下次真實事件，不能由蒐證功能通過推論已修好Codex停滯。
