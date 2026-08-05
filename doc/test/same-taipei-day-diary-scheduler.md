# Same-Taipei-day Daily diary scheduler

## Test Depth Route

- Level: 3
- Reason: shared timestamp-derived date contract across SQLite readers, scheduler state/idempotency and externally visible diary output.
- Required verification: failing-first focused tests, Core full suite/typecheck, root tests/build, OpenSpec gates, Owner in-memory API smoke and independent black-box QA.
- Allowed skips: no UI screenshot/RWD because presentation code is unchanged; no real provider or user-database write because deterministic generators and in-memory SQLite cover the changed contract.

## Bug Pattern Coverage

- [x] Boundary values / Taipei 00:00, 01:00, 23:59 and UTC 16:00 rollover.
- [x] Rule priority conflicts / exact target-date session eligibility wins over Workspace active/idle.
- [x] Contract generated and execution applied / derived Taipei date reaches Dashboard, Workspace, export, prompt and persisted scheduler result.
- [x] Operation order invariants / scan before eligibility, semantics resolution before claim, marker only after final success.
- [x] Production-like dirty data / old success with no semantics marker, existing UTC-keyed token aggregates, no diary row with UI fallback.
- [x] Multi-condition combinations / same date + active/inactive projects + forced/ordinary + confirmed rows.
- [x] State/history/retry/refresh / first transition rerun then same-semantics skip; later same-day sessions do not automatically rerun.
- [x] Externally observable result / API result date and persisted rows/counts, not helper output only.
- Not applicable: aliases, negation, auth/permission, secret handling and UI layout are unchanged.

## Runtime Verification Route

- Runtime smoke: REQUIRED — Core loopback API, in-memory SQLite, deterministic generator.
- Black-box QA: REQUIRED — different read-only no-fork agent after Owner smoke.
- Safe environment or localhost command: repository Core tests/runtime with `:memory:` database.
- Safe test account / mock access: no account; deterministic agent injection.
- Forbidden or destructive actions: no user DB writes, real-provider calls, project-file writes, deploy or push.

## [x] 【日期邊界】UTC timestamps 統一歸入台北日曆日與小時
**範例輸入**：sessions at `2026-08-04T16:30:00Z`, `2026-08-05T15:59:59Z`, `2026-08-05T16:00:00Z`。
**期待輸出**：前兩筆屬於台北 8/5，最後一筆屬於 8/6；Workspace、Dashboard、export 與 diary snapshot 結果一致。

## [x] 【整合流程】01:00 排程只整理當日截至當下的 activity
**範例輸入**：台北 8/5 01:00 tick；project A 在 00:30 已有 session，project B 沒有。
**期待輸出**：result/date 與持久化 rows 使用 8/5；A 進入 Daily diary AI work，B 沒有 Daily diary 寫入；既有 Project summary／Kanban scope 不在本案例中改變。

## [x] 【狀態回歸】稍後新增同日 session 不觸發普通重跑
**範例輸入**：8/5 01:00 success 後，8/5 10:00 新增 session，再 ordinary tick。
**期待輸出**：普通 tick skipped；Run now 或手動 regenerate 仍可更新 AI-generated 8/5 diary。

## [x] 【升級相容】舊 success 不阻止新語意首次執行
**範例輸入**：8/5 已有 success row，但 settings semantics marker 缺失／舊版。
**期待輸出**：current-semantics tick 安全重跑一次並在成功後記錄 marker；之後普通 tick skipped；有效 lease 仍不可被搶占。

## [x] 【狀態保護】transition／forced rerun 保留 confirmed diary
**範例輸入**：eligible project 的 8/5 diary 已 confirmed。
**期待輸出**：內容與 status 不變，result preserved count 正確。

## [x] 【來源辨識】有 session、無 persisted diary 時只是 UI fallback
**範例輸入**：8/5 有 session，但 `project_daily_diaries` 無 row。
**期待輸出**：snapshot 可顯示 deterministic session-count fallback；DB 與 scheduler status 不宣稱它是 AI diary。
