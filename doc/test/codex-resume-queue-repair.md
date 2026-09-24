# Desktop active-writer 派送修復

## 根因
2026-09-19 恢復時間14:02的真實派送未開始。受控診斷確認 exec resume 於394ms以active writer/thread-store conflict退出；同一目標公開queue命令exit0，原Desktop出現新turn且執行中。修復前原dispatcher丟棄stderr，無法分辨原因。

## 路由
O3 external_write；mandatory integration_authority/failure_recovery。Level4，重複核心流程／外部寫入，runtime smoke與independent QA REQUIRED。未修改schema；只改queue transport、same-store context、安全診斷與準確UI文字。真實診斷已送一次queue成功，不得重播已消耗事件。

## 測試案例
- [x] exact queue argv、same-store CODEX_HOME、UUIDv7，exit0＋完整精確receipt才成功。
- [x] wrong target/message UUID、額外stdout、缺換行、legacy JSON與非零exit即使有receipt仍拒絕。
- [x] stderr安全分類、stdout/stderr上限、timeout與頑固process group終止、未知結果不重送。
- [x] API→session→queue→完成evidence，第二tick不重播；hostile label不進argv。
- [x] UI顯示已送出要求，不宣稱已開始或工作完成；desktop實畫面驗證。
- [x] bundled CLI在隔離CODEX_HOME fixture實際queue成功，確認不寫真實store。
- [ ] 獨立QA與審查；打包後source/簽章/安裝背景驗證。

## 殘餘限制
Queue receipt表示durable enqueue，Desktop需可處理queue才會開始；未知結果一律人工確認，不清除consumed cursor。真實新turn另以Desktop task狀態確認。

## Bug-pattern matrix
| 類型 | 外部可觀察斷言 |
|---|---|
| 產生但未執行契約 | fake CLI 實際 argv＋CODEX_HOME receipt；API 整條路徑只送一次 |
| 身分／store 隔離 | wrong UUID 拒絕、rN 對應的 root 真正進 child env |
| receipt 與退出順序 | receipt 後非零／signal／timeout 皆不宣稱接受 |
| 邊界與不完整資料 | 分段stdout、CRLF、缺換行、超限 stderr/stdout、duplicate receipt |
| 歷史／恢復 | consumed evidence/high-watermark 完整保留，第二tick與明確恢復監看不重播 |
| 敏感輸出 | raw錯誤中含token/path/transcript，返回／持久化只含固定enum |
| 產品狀態 | 已送出續跑要求只代表入佇列，Desktop未處理時不稱已開始 |

## 審查修正案例
- [x] generic recovery只允許active_writer/queue_unsupported/session_not_found/auth_required，必須false→true、completed evidence/cursor、clean lease、無claim/attempt/action/quarantine。
- [x] legacy not_acknowledged、invalid receipt、timeout、generic failure與未知結果保持停止；特定舊目標只可另用精確證據人工compare-and-set。
- [x] parent先close、後代關閉管線並忽略TERM：群組未消失不得清lease，KILL後需probe ESRCH；EPERM/未知probe結果quarantine。

- [x] runner claim 後死亡、子程序仍活、重啟且 lease 過期：consume evidence、保留 lease identity/max deadline、quarantine=1；同 tick/下一 tick/第二次重啟對所有 targets 零派送，mutation 不可解除。

- [x] 真實 CLI queue 的 plugin Git 子程序可存活過 parent：有效 receipt＋期限內 exit0 後做有界 cleanup；只有證明全群組已不存在才記 accepted；未證明 quarantine，原 timeout/nonzero 永不升格成功。

獨立 browser gate BLOCKED；Core 黑箱 10/10 與截圖 review PASS，完整 QA 不冒充通過。特定舊目標 repair preconditions dry-run PASS，但未 apply。
