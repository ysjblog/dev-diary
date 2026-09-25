# Queue 修復審查根因與矛盾對帳

本文件是 final REJECT 後的 bounded root-cause continuation，不重啟完整審查輪次，不覆寫原審查結果。

| Finding | 根因 | 證據 | 修正邊界 | 驗證 |
| --- | --- | --- | --- | --- |
| QF1 | 只修正常 dispatcher 終止，漏掉重啟後 expiry 的獨立寫入者；把時間到誤當程序停止 | engine recovery UPDATE 清全域 lease，detached child 可活過 runner | design/Delta 統一永久 quarantine；engine 過期 recovery 必須保留 lease 並 consume cursor；schema 不具跨重啟 PID 證明所以不自動解除 | 多 target、runner 重啟、過期、後續 tick 皆零派送；mutation 不能解鎖 |
| QF2 | 追加 verifyString 只證明字串存在，沒檢查原段落語意仍指向 exec | Proposal 摘要與 Why 舊命令與 Dispatch 禁止 fallback 衝突 | 重寫摘要與 Why、success wording | 全文剩餘 exec 只能是排除/歷史敘述 |

預期代價：真正崩潰後所有自動續跑會停止，需人工診斷；寧可明確停止也不自動重播不明結果。一般已確認 queue exit/receipt 且群組不存在的成功流程照常釋放鎖。

需一次 fresh bounded contradiction review 確認 QF1/QF2 根因修正；不是第二次全範圍 closer。舊真實 queue 證據只證明傳輸可行，不能代替新實作測試與安裝證據。

## 真實 CLI 子程序追加證據
隔離 public queue 正常 code0、完整 receipt、queued_items=1；direct child close 後至少197ms process group仍存在。ps 僅取 pid/ppid/pgid/comm 證明是 CLI 啟動的 git/git-remote-https 後代。舊設計把這種已確定收件但需cleanup的情況誤判command_failed。修正成功條件順序：先保留期限內 parent exit0+receipt 證據，完成有界TERM/KILL且群組確定不存在後才接受；不省略安全終止、不變更argv，也不將timeout/非零/未知結果轉成功。需要 bounded independent check 再實作。
