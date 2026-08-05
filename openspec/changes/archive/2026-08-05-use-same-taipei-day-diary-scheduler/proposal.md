---
openspec_level: o1
template_version: owner-workflow/v1
change: use-same-taipei-day-diary-scheduler
reasons: durable_shared_contract, multiple_journeys_roles
---
# Change Proposal: Use same Taipei day for diary scheduler

## 中文摘要

Daily diary 排程改為整理「執行當下的台北日曆日」，不再固定抓前一天。01:00 執行就只使用當天 00:00 到執行前已掃描到的 activity；只有目標日已有 session 的專案才會進入 scheduled AI generation。所有日期型讀取統一以 `Asia/Taipei` 分桶，畫面上的非持久化 fallback 仍清楚區分於 AI diary。

## Why

Runtime SQLite 證明 `sessions.start_time` 是 UTC `Z` timestamp，但 Workspace、Dashboard、exports 與 scheduler snapshot 多處以 `substr(start_time,1,10)` 當日期，造成台北 00:00–08:00 活動被歸到前一天。最近 202 筆 session 有 38 筆跨了 UTC／台北日期邊界。使用者也明確要求排程時間代表當日 point-in-time snapshot，而不是前一個完整日曆日。

畫面上的 2026-08-05「開發摘要」沒有對應 `project_daily_diaries` row，是 UI 依 session 產生的 deterministic read fallback，不是 scheduler 或 AI provider 寫入；這個區別必須保留。

## What Changes

- Scheduler automatic tick and Run now use the current `Asia/Taipei` calendar date.
- Scheduled Daily diary generation is limited to projects with at least one persisted session on that Taipei target date at execution time; Workspace `active`/`idle` is not used for eligibility. Existing scheduled Project summary and Kanban behavior is unchanged.
- Calendar-day and hourly readers derive Taipei date/hour from UTC session timestamps across Workspace, Dashboard, exports and scheduler inputs.
- Date-scoped token totals use sessions as the canonical timestamped source rather than legacy `token_usage.date` buckets.
- A scheduler semantics marker prevents a success row produced by an older date rule from suppressing the first run under the new rule.

## Scope

- Included: Core date helpers/readers, scheduler target/eligibility/idempotency, settings semantics marker, tests, current spec and Traditional-Chinese project map.
- Not included: changing raw UTC session timestamps, rewriting/deleting historical SQLite rows, UI layout changes, automatic reruns after later same-day activity, real-provider production calls, or modifying confirmed diary content.

## Non-Goals

- Do not equate scheduler eligibility with the five-day Workspace `active` status.
- Do not claim a UI fallback summary is persisted AI output.
- Do not silently include activity that arrives after a same-day scheduler run has completed.

## Capabilities

### Modified Capabilities

- `dev-diary-macos-app`: changes calendar-day derivation and scheduler target/eligibility behavior.

## Impact

- Writers: scheduler success state/settings marker; no schema or destructive data migration.
- Readers: project snapshots, Dashboard, exports, scheduler Daily-diary eligibility/inputs and prompt evidence.
- Compatibility: raw UTC timestamps and existing diary rows remain unchanged; legacy token aggregates remain stored but are not authoritative for calendar-day reads.

## Risks

- A 01:00 run intentionally sees only the first hour of the day; later activity requires Run now or manual regenerate.
- Changing date buckets alters historical daily totals near midnight; this is the correction, not data loss.
- Upgrade recovery could rerun an AI-generated row; confirmed rows remain protected.

## Open Questions

- Resolved: target date is the same Taipei calendar date as execution.
- Resolved: eligibility means at least one persisted target-date session at execution time, not Workspace tracking status.
- Resolved: no automatic second run occurs when later same-day sessions arrive.

## Completion

- [ ] Same-day scheduler and Taipei date/hour scenarios pass.
- [ ] Inactive target-date projects receive no scheduled AI writes.
- [ ] Upgrade semantics and confirmed-content protections pass.
