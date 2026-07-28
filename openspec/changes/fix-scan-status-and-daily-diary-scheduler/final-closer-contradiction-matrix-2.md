# Final closer root-cause rollover 2

## Finding

- `SOL-LOGIC-001`：Project diary confirmation 仍會改寫 `daily_logs.per_project_summary`。

## Contract contradiction

- Feature/Delta Spec 把 `project_daily_diaries` 定義為單一專案／日期日記確認的 source of truth。
- 舊 writer 在 confirmed 分支完成 table upsert 後，仍把同一份內容投影到 global `daily_logs`。
- 因此「單一專案確認不影響 global daily log」的語意沒有真正落地，即使 `summary_status` 沒有被標成 `confirmed`。

## Root cause

`upsertDailyProjectSummary` 同時承擔 project diary persistence 與 legacy global projection 兩個責任；confirmed path 沒有在 project table 寫入後結束，讓 project-level user action 仍有 global write side effect。

## Bounded repair

- confirmed diary writer 只 upsert `project_daily_diaries` 後返回。
- global `daily_logs` projection 只由 scheduler 的 global highlight transaction 更新。
- 回歸測試保存確認前後的 global row 完全不變，同時驗證 project diary row 為 `confirmed`。

## Verification strings

- `Project diary confirmation is independent from the global daily highlight projection.`
- `global daily highlight projection is written later by the scheduler only.`

## Scope boundary

桌面-only；mobile/RWD 不適用，這次 rollover 不新增手機驗證。
