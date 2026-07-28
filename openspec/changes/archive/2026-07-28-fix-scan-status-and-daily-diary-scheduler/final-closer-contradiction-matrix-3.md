# Final closer root-cause rollover 3

## Finding

- `SOL-BLAST-002`：Global `daily_logs` projection 仍可由 scan path 更新。

## Contract contradiction

- Global Daily highlight 是日期層級的 scheduler output；project Daily diary 已有自己的 `project_daily_diaries` source of truth。
- `runManualScan` 一面寫入 scan-local sessions/Kanban，一面更新 `daily_logs.per_project_summary`，讓它成為第二個 global projection writer。
- 因此 scheduler 的輸出順序與 global projection ownership 不再唯一，掃描也可能在 scheduler 之外改變 Daily highlight supporting data。

## Root cause

`runManualScan` 保留了早於 scheduler/diary table 分離的 legacy summary merge；後續的 source-of-truth repair 移除了 confirmed diary writer 的 side effect，卻沒有把 scan path 一併移出 global `daily_logs` ownership。

## Bounded repair

- 移除 scanner 的 `daily_logs` merge/upsert；scan result 的 compatible `updated_daily_logs` 保持為 0。
- 明定 scheduler final Daily highlight transaction 是唯一的 date-level `daily_logs` writer。
- 以 deterministic scan 對既有 daily row 的前後完整比較鎖定 regression。
- Desktop scan control 在 Core operation 已完成而選用 Kanban AI 尚在等待時顯示 AI post-processing，而不是「正在掃描」。

## Verification strings

- `scheduler is the sole owner of the global daily_logs projection`
- `updated_daily_logs).toBe(0)`

## Scope boundary

Desktop-only；mobile/RWD 不適用，這次 rollover 不新增手機驗證。
