# Final closer root-cause rollover 4

## Finding

- `SOL-BLAST-003`：scheduler 將 confirmed project diary 注入 global `daily_logs.per_project_summary`。

## Contract contradiction

- `project_daily_diaries` 是每個專案／日期 confirmed Daily diary 的 source of truth。
- `daily_logs` 是日期層級的 global Daily highlight supporting projection，不承載 project diary status 或 confirmed content。
- scheduler 在 final global projection 前讀取 confirmed diary markdown 並覆蓋同 project 的 activity summary，讓 project-level manual content 間接污染 global row。

## Root cause

`upsertDailyLog` 同時組合 activity-derived summary 與 confirmed project diary rows；前次移除 writer 時只消除了直接寫入，沒有追蹤 confirmed diary 經由 scheduler transform 再進入 global writer 的資料流。

## Bounded repair

- scheduler 全域 projection 只組合 date-level activity summaries；不讀取或注入 `project_daily_diaries` markdown。
- confirmed diary 繼續保留在其 table row，scheduler rerun 不覆寫它。
- regression 同時斷言 global row 不含 manual diary、project row 仍為 confirmed 且 markdown 完整保留。

## Verification strings

- `confirmed project diary must remain independent from the global daily highlight`
- `not.toContain('使用者已修正這天的內容')`

## Scope boundary

Desktop-only；mobile/RWD 不適用，這次 rollover 不新增手機驗證。
