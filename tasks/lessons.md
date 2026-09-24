# Lessons

## [2026-07-13] 查「掃描沒反應」類問題，先讀 runtime SQLite 而非只讀 repo 程式碼
- **觸發情境**：使用者回報「掃描了但沒有預期效果」（新資料夾沒被加入 workspace、卡片沒更新等）。
- **正確做法**：先讀 `~/Library/Application Support/DevDiary/DevDiary.sqlite` 的 `app_settings`（project_roots、scan 相關設定）與 `projects` 表，確認實際 runtime 狀態，再回頭對照程式碼邏輯；比單純讀 repo 更快定位是「設定沒涵蓋」還是「邏輯真的有 bug」。
- **為什麼**：這次靠查 sqlite 才發現 project_roots 底下已有 12+ 個追蹤中專案，直接印證了 `shouldDiscoverProjectRoots()` 的一次性節流假設成立，比純讀 code 猜測快很多。

## [2026-07-13] 根因其實是刻意設計時，改行為前先問使用者要哪種修法
- **觸發情境**：root-cause-debugging 找到的成因背後有明確命名的既有測試在保護該行為（例如「避免每次更新都重新 discovery」），代表這是刻意 tradeoff，不是意外疏漏。
- **正確做法**：不要因為找到 root cause 就直接推翻設計；用 `AskUserQuestion` 列出至少兩種修法（例如「每次都重跑」vs「保留節流但改成定期重跑」），讓使用者選，再動手。
- **為什麼**：這類 tradeoff 往往是為了效能或成本刻意做的犧牲，使用者可能有背景資訊（例如 API 配額、效能實測）是目前 session 看不到的；先斬後奏會冒著推翻正確設計的風險。

## [2026-07-13] root-cause-debugging 定位出「修復邊界」後，先建 branch 再動手改檔案
- **觸發情境**：任何 bug 修復，一旦確定要開始 Edit/Write 程式碼。
- **正確做法**：在第一個 Edit 之前就跑 `git checkout -b fix/<name>`，不要先改完檔案才想到要建 branch。
- **為什麼**：這是重複發生的疏漏——這次是改完 `core/src/services/scans.ts` 才想到要建 branch，只是剛好還沒 commit 才補救得回來；若當下已經 commit 到 main 就要多一道 revert/cherry-pick 的麻煩。

## [2026-09-24] 讀「別人正在寫入的檔案」時，前後 stat 不一致要重讀，不可當成檔案被竄改
- **觸發情境**：程式讀 Codex / Claude 等外部程式仍在 append 的 session 檔，並用 size/mtime/prefix 做完整性判斷。
- **正確做法**：把「讀到一半檔案變了（暫時不穩）」和「檔案真的被換掉／截斷／改寫（完整性失敗）」分成兩種結果；前者重讀幾次，仍不穩就本輪跳過、不寫狀態；只有穩定讀到的內容才拿來判定完整性失敗。
- **為什麼**：Codex 續跑 engine 原本把兩者混成同一個 null，撞到 Codex 同時寫入就把任務永久標成 `session_integrity_changed`，使用者要手動重開。
