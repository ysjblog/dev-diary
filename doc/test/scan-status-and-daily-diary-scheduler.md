# Scan status and Daily diary scheduler

## Test Depth Route

- Level: 4
- Reason: This change alters shared SQLite lifecycle state, concurrent local-process scheduling, date defaults, and a user-visible daily workflow that must preserve confirmed content.
- Required verification: Focused Core regression/integration tests; Core typecheck; root API tests and build; main-agent localhost smoke; independent Verify-QA after Execute.
- Allowed skips: No mobile viewport/RWD validation because the product contract is desktop-only and the user explicitly excluded phone-interface verification; no production/provider calls, long-duration sleep soak, or packaged-app verification in Execute.

## Bug Pattern Coverage

- [x] Boundary values / Taipei midnight default date and 30-second/ten-minute lifecycle boundaries.
- [x] Contract generated and execution applied from normalized settings through scan responses and Footer consumers.
- [x] Operation order invariants: claim before work, project outputs before Kanban, then final highlight/success transaction.
- [x] Production-like dirty data: legacy, malformed, dead-owner, and concurrently live operations.
- [x] Multi-condition combinations: confirmed during provider await, forced rerun, expired lease, and final-state persistence failure.
- [x] State/history/retry/refresh behavior: finish-on-error, ordinary same-date skip, safe retry after failure, and one row per project/date.
- [x] Externally observable result, not only implementation detail: Core API snapshots, daily export, and backup content.

## Runtime Verification Route

- Runtime smoke: REQUIRED — localhost Core scan/scheduler/export calls with safe local test data.
- Black-box QA: REQUIRED — independent Verify-QA task after this Execute task is green.
- Mobile viewport/RWD validation: NOT APPLICABLE — only supported desktop viewports are in scope.
- Safe environment or localhost command: repository Core test runtime / localhost only.
- Safe test account / mock access: deterministic generators and in-memory SQLite; no real provider credentials.
- Forbidden or destructive actions: no production access, project-folder writes, Git mutation, raw SQLite export, or confirmed-diary overwrite.

## Root Cause Debugging — final-closer/QA rollover 3

- Symptom: manual scan could rewrite the scheduler-owned global `daily_logs.per_project_summary`; when optional Kanban AI then waited on a provider, the desktop control continued to say scanning even though Core had already finished its scan operation.
- Reproduction: run a deterministic global scan against a pre-existing daily row, or open the supported desktop UI with automatic scan and optional Kanban AI enabled while Core reports `running_operations: []`.
- Root cause: `runManualScan` still contained a legacy global projection writer, and the UI represented the whole pending HTTP request as a scan instead of distinguishing Core scan work from optional AI post-processing.
- Fix boundary: remove the scanner's `daily_logs` write path; leave the scheduler as the single global projection writer; derive the desktop action label from reconciled Core operation state plus the pending optional post-processing request.
- Verification: add scanner immutability regression and presentation-state regression, then rerun targeted suites, supported desktop smoke, and fresh independent desktop QA. Mobile/RWD remains NOT APPLICABLE.

## Root Cause Debugging — final-closer rollover 4

- Symptom: a confirmed project Daily diary could reappear in the scheduler-written global `daily_logs.per_project_summary` even after direct scan and confirmation writers were separated.
- Reproduction: save a confirmed `project_daily_diaries` row, run a deterministic forced scheduler, then inspect the global daily row.
- Root cause: the scheduler assembled its global projection by reading confirmed project diary markdown and overwriting the generated per-project summary value before the final daily-log upsert.
- Fix boundary: retain the confirmed row in `project_daily_diaries`, but remove it from the scheduler global-projection input; the scheduler may write date-level activity summaries only.
- Verification: change the scheduler regression so the global row excludes manual diary content while the project diary row remains confirmed and unchanged; rerun the scheduler suite and a fresh final closer. Mobile/RWD remains NOT APPLICABLE.

## Root Cause Debugging — final-closer rollover 5

- Symptom: scheduler still reached confirmed project diary markdown through the general Workspace snapshot, and the desktop pending-request label claimed AI synchronization before the UI had observed a Core terminal state.
- Reproduction: make SQLite preparation throw on any scheduler `SELECT` that reads `project_daily_diaries.markdown`; start a scan request while the server performs scan work before optional AI sync.
- Root cause: `buildDailyProjectInputs` reused `getProjectDetail`, whose read model includes diary content; the UI mapped a pending composite request directly to the post-processing label.
- Fix boundary: build scheduler activity input through direct non-diary queries; retain scan wording until the request reaches a Core terminal response, reserving the AI label for independently observable AI work.
- Verification: test that scheduler cannot prepare a diary-table query, and test pending request presentation separately from explicitly observed post-processing. Mobile/RWD remains NOT APPLICABLE.

## Root Cause Debugging — independent closer findings

- Symptom: Core scan operation and Kanban AI can both be complete, yet the desktop spinner remains active while the UI performs follow-up Dashboard and Project-detail reads; confirmed project diary reads also queried legacy global `daily_logs` before the project-diary table.
- Reproduction: complete `POST /api/scan`, then delay either UI follow-up GET; save a confirmed `project_daily_diaries` row and make any later legacy `daily_logs.per_project_summary` read fail while loading that date.
- Observed evidence: the UI cleared `isScanRunning` only in the request function's final block, after its follow-up GET calls; `buildDiary` selected global rows before loading the table row.
- Root cause: one UI boolean represented both scan/AI work and response-refresh work, and the diary reader implemented table overwrite rather than table-first fallback.
- Fix boundary: retain a separate non-spinning refresh guard after a completed scan/AI response; load project diary rows first and query legacy per-project-summary rows only for dates without a table row.
- Verification: add a UI source/regression test that the spinner clears before follow-up reads and a Core guard test that a confirmed date can load with every legacy per-project-summary query rejected; rerun Level 4 verification and a fresh independent desktop-only closer.

## New regression cases — independent closer findings

## Root Cause Debugging — table-first bypass

- Symptom: scheduler input uses `includeDiary: false` to avoid carrying diary markdown, but that flag also skipped the table-first reader and allowed legacy `daily_logs.per_project_summary` to be read for every date.
- Reproduction: load a project detail with `includeDiary: false` while rejecting every legacy per-project-summary query.
- Root cause: `includeDiary` incorrectly controlled both rendering and the fallback-read boundary.
- Fix boundary: a non-diary snapshot must not query either project diary markdown or legacy per-project summary; it uses activity-derived fallback only.
- Verification: add the same SQL guard for `includeDiary: false`, then rerun project, scheduler and full Core/UI regression suites.

## [x] 【狀態回歸】掃描與 AI 回應完成後，後續資料刷新不維持轉圈
**範例輸入**：`POST /api/scan` 已回傳（代表 Core scan 與 inline Kanban AI 都已完成），接著 Dashboard 或 Project detail refresh 尚未回來。
**期待輸出**：掃描按鈕不再顯示 spinner；refresh 仍可暫時禁止重複操作，但不得被當成掃描或 AI 執行中。

## [x] 【資料隔離】confirmed project diary table-first，不讀同日期 legacy per-project summary
**範例輸入**：指定日期同時有 confirmed `project_daily_diaries` 與 legacy `daily_logs.per_project_summary`；讀取時讓該 legacy projection SQL 查詢失敗。
**期待輸出**：Project detail 仍回傳 confirmed markdown；該日期不會查詢或帶入 legacy per-project summary。

## [x] 【資料隔離】非日記 scheduler snapshot 不讀 legacy per-project summary
**範例輸入**：使用 `includeDiary: false` 讀取 Project detail，並讓所有 `per_project_summary` SQL 查詢失敗。
**期待輸出**：snapshot 仍可提供 activity-derived summary，但不查詢或帶入任何 project diary 或 legacy per-project summary。

## [x] 【整合流程】掃描 operation 只顯示可證明仍活著的工作
**範例輸入**：legacy、malformed、dead-PID、expired-deadline 與同時存在的 live operation。
**期待輸出**：只有 live operation 留在 `running_operations`；其餘以安全 metadata 回收；finish 只移除自己的 id 並保留最新完成順序。

## [x] 【狀態回歸】全域、專案與背景掃描在錯誤後都清除自己的 operation
**範例輸入**：start 後 `runManualScan` 或背景流程拋出錯誤。
**期待輸出**：每個 owner 至多嘗試一次 terminal finish，回應維持既有安全錯誤契約，Footer 不會永久顯示掃描中。

## [x] 【資料邊界】Daily diary table-first 讀取與確認內容保護
**範例輸入**：同日 legacy `daily_logs` 與 `project_daily_diaries`，以及 provider await 期間被使用者確認的內容。
**期待輸出**：snapshot/export 優先使用 table row、backup 包含該 collection；confirmed row 不被 AI upsert 覆寫。

## [x] 【整合流程】排程 lease、日期與輸出順序
**範例輸入**：台北午夜到 UTC 08:00、兩個 runtime 的普通 tick、same-day force、expired lease 與多 project。
**期待輸出**：所有預設 reader 取同一 Taipei 日期 D；普通 tick 成功後略過，force 僅在無有效 lease 時可重跑；project summary/diary 在 Kanban 前，最後才寫 highlight 與 success。

## [x] 【錯誤處理】scheduler final transaction 失敗不會假裝成功
**範例輸入**：global highlight/success transaction 失敗，以及後續 durable failure write 也失敗。
**期待輸出**：highlight/success 回滾；可寫時持久化 failed，否則結果為 failed 並帶 `failure_state_not_persisted`，後續可安全重試。

## [x] 【狀態回歸】掃描不改 scheduler 專屬全域日誌，複合請求完成前不過早宣稱 AI 同步
**範例輸入**：已有 `daily_logs` projection 的 deterministic global scan；桌面仍在等待完整 scan request 回應，但尚未有可獨立觀察的 Core 終態。
**期待輸出**：scan result 的 `updated_daily_logs` 為 0 且 daily row 前後相同；桌面控制持續顯示「正在掃描」，直到完整請求回傳終態；不會根據尚未完成的 HTTP request 宣稱「正在同步 AI 建議」。

## [x] 【資料隔離】confirmed project diary 不進入 scheduler 的全域日誌投影
**範例輸入**：已有 confirmed `project_daily_diaries` row 的日期，接著執行 deterministic forced scheduler。
**期待輸出**：global `daily_logs.per_project_summary` 只保留 activity-derived summary，不包含使用者 confirmed diary；project table row 維持 `confirmed` 且 markdown 完整不變。
