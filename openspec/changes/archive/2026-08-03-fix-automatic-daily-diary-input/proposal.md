---
openspec_level: o1
template_version: owner-workflow/v1
change: fix-automatic-daily-diary-input
reasons: durable_shared_contract,multiple_journeys_roles
---
# Change Proposal: Fix automatic Daily diary input

## 中文摘要

修正自動 Daily diary 在掃描到當日活動後仍回報「該日期資料不足」的問題。01:00 排程改為整理前一個完整的台北日曆日，並讓手動 regenerate 與 scheduler 共用同一份已清理、有實際工作內容的 structured evidence。

## Why

Runtime SQLite 顯示近日排程成功且 sessions 存在，但有活動的專案仍全數產生「該日期資料不足」。目前 prompt 要求修改、測試、決策與 commit 脈絡，但 `buildProjectDiaryPrompt` 只提供 session 日期、token 與狀態；設定允許 5,000 字元 prompt，runtime 卻把整份組合後 prompt 截在 1,800 字元，使尾端 structured data 可能消失；同時 01:00 排程整理剛開始的當天，成功後也不再重跑。

## What Changes

- Non-forced and forced scheduler runs resolve their output date to the previous `Asia/Taipei` calendar day.
- The date-scoped diary prompt includes bounded, redacted session summaries/commands and date-scoped recent commit titles.
- A valid prompt override up to the persisted 5,000-character settings limit cannot consume or truncate the appended safety and structured-evidence sections.
- Manual date-specific regenerate keeps its explicit requested date and uses the same prompt evidence builder as the scheduler.
- Prompt evidence remains untrusted data, excludes raw transcripts/source refs/absolute paths/secrets, and is length bounded.

## Scope

- Included: Core scheduler date resolution, diary prompt evidence composition, regression tests, current spec and test documentation.
- Not included: UI layout changes, provider/model changes, raw transcript access, project-file writes, migration of existing generated diary rows, or production/provider calls.

## Non-Goals

- Do not make the AI follow instructions found inside session text.
- Do not expose `source_log_ref`, project roots, credentials, raw transcripts, or complete private logs.
- Do not overwrite confirmed Daily diary rows.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `dev-diary-macos-app`: modifies date-scoped diary evidence and scheduler target-date behavior.

## Impact

- Writers: `DailySchedulerRuntime.runNow`, date-scoped project diary writer.
- Readers/consumers: configured diary agents, `project_daily_diaries`, `daily_logs`, daily exports, scheduler status.
- Persistence: no schema migration; scheduler run keys and output rows use the previous Taipei date.

## Risks

- More useful session evidence can contain private or prompt-injection-like text; mitigate with redaction, truncation, explicit untrusted-data constraints, and tests.
- Existing same-day scheduler state can cause one transition-day skip or rerun decision; ordinary idempotency remains keyed by the resolved target date.
- Date-scoped Git evidence may be unavailable for non-Git projects; the prompt must represent it as `none` without failure.

## Open Questions

- Resolved: manual per-project regenerate retains its explicit selected date.
- Resolved: scheduler Run now uses the same previous-day target as automatic scheduler execution so both scheduler paths share one durable key.

## Completion

- [x] Automatic scheduler writes the previous Taipei day and remains idempotent for that target date.
- [x] Manual and automatic Daily diary generation receive the same safe evidence fields for the same project/date.
- [x] Secret/path/source-ref and prompt-injection regression tests pass.
