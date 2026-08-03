---
openspec_level: o1
template_version: owner-workflow/v1
change: fix-automatic-daily-diary-input
reasons: durable_shared_contract,multiple_journeys_roles
---
# Delta Spec: Fix automatic Daily diary input / dev-diary-macos-app

## 中文摘要

自動 Daily diary 改為在排程時間整理前一個完整的台北日曆日，並與手動單日 regenerate 共用相同的安全 evidence builder。輸入會加入已清理、有長度上限的 session 摘要與當日 commit 標題，不會加入 raw transcript、source ref、絕對路徑或機密。

## Baseline

- Capability: `dev-diary-macos-app`
- Current Feature Spec: `openspec/specs/dev-diary-macos-app/spec.md`
- Change: `fix-automatic-daily-diary-input`

## MODIFIED Requirements

### Requirement: Date-scoped diary and AI draft recovery

The system SHALL keep daily diary reads, saves, and regenerations pinned to the selected date; it SHALL support Core-backed Claude Code, Codex CLI, enabled Antigravity CLI, and configured local Ollama providers where available, and SHALL return a deterministic fallback draft on provider failure, timeout, or disabled state. A Daily diary is persisted in `project_daily_diaries` with exactly one row per `(project_id, date)`, `markdown`, `status` (`ai_generated` or `confirmed`), `fallback_report`, and timestamps; the `(project_id, date)` unique constraint is the source of truth for confirmation. `daily_logs.per_project_summary` remains a backwards-compatible Daily highlight supporting snapshot, not the source of truth for each project's diary status. Daily Markdown export SHALL read `project_daily_diaries` first for the requested date and use legacy `daily_logs.per_project_summary` only where that table has no row; redacted backup SHALL include `project_daily_diaries` as a separate app-owned collection. Manual date-specific regenerate and an eligible daily scheduler run SHALL invoke the same Core-owned date-scoped Daily diary generation path and shared prompt evidence builder for the same project/date. The evidence builder SHALL include bounded, redacted session command/summary evidence and date-scoped recent commit titles when available, SHALL treat every evidence value as untrusted data rather than instructions, and MUST exclude raw transcripts, `source_log_ref`, absolute project paths, credentials and secret-like values. Every valid persisted prompt override up to the settings contract limit SHALL retain the appended safety constraints and complete generated `STRUCTURED_DATA`; runtime prompt budgeting MUST NOT silently truncate those trailing sections. The scheduler SHALL invoke that path once for each project for its resolved target date using `ai_prompts.daily_diary_entry` and a distinct Daily-diary generator/configuration path. It SHALL create or refresh only `ai_generated` rows. The write SHALL conditionally re-check `status != confirmed` inside the SQLite transaction that upserts the row and return `updated` or `preserved`; it MUST NOT overwrite a `confirmed` entry, including one saved while a provider await is in progress. The Project summary and Daily diary are separate outputs and SHALL not replace one another.

#### Scenario: Manual and scheduled generation receive the same safe evidence

- **WHEN** a project has sessions and commits on date `D`, and the user manually regenerates date `D` or the scheduler generates date `D`
- **THEN** both paths provide the diary agent with the same bounded redacted session/commit evidence fields for `D`, without raw transcript, `source_log_ref`, absolute paths, or secrets, and treat instruction-like evidence text as inert untrusted data.

#### Scenario: Scheduler creates an unconfirmed Daily diary for each project

- **WHEN** the daily scheduler performs an eligible run for target date `D` and a project has no confirmed Daily diary for `D`
- **THEN** Core generates a date-`D` diary draft through the date-scoped writer using the Daily diary prompt, persists it as `ai_generated`, and reports that diary output separately from the project summary output.

#### Scenario: A maximum-length prompt override retains structured evidence

- **WHEN** the configured Daily diary prompt is valid at the persisted maximum length and Core appends safety constraints plus bounded evidence
- **THEN** the provider input contains the complete override, safety boundary and `STRUCTURED_DATA` fields instead of truncating the trailing evidence.

#### Scenario: Scheduler preserves a confirmed Daily diary

- **WHEN** a project has a `confirmed` Daily diary for target date `D` before or during the scheduler run
- **THEN** the scheduler does not call a write that replaces that entry, reports it as preserved/skipped, and may still refresh that project's separate Project summary and the global Daily highlight.

#### Scenario: Daily diary provider is unavailable

- **WHEN** the configured diary provider is disabled, unavailable, times out, or fails while the scheduler generates date `D`
- **THEN** the date-scoped writer stores the deterministic fallback as `ai_generated`, keeps any confirmed content intact, records sanitized fallback evidence, and allows the remaining daily outputs to continue.

### Requirement: Scheduler and runtime lifecycle are fail-safe

The system SHALL run ordinary in-app scheduler ticks at most once per configured target day, expose preflight and Run now status, recover from sleep-like Core gaps with a recovery tick, and use a redacted runtime manifest plus loopback validation for dynamic Core-port discovery. At or after the configured `Asia/Taipei` wall-clock run time, scheduler target date `D` is the previous `Asia/Taipei` calendar day; forced Run now uses the same target-date rule, while explicit project diary request dates remain exact user input. Scheduler writes, scheduler status/default reads, and scheduler-produced export rows SHALL use that same `D`. A SQLite-backed `daily_scheduler_runs` record keyed by `D` SHALL atomically claim one non-forced run with `owner_instance_id`, `lease_expires_at`, and `status`; an active valid lease returns `running`, a terminal success returns ordinary `skipped`, and an expired lease is recovered as failed before a later claim. `force: true` is an operator-initiated rerun for resolved target date `D` and may claim a new attempt only when no valid lease exists. A background cycle MUST NOT invoke Kanban AI auto-add independently of the daily scheduler gate. For `D`, Project summary generation, unconfirmed Daily diary generation, and Daily highlight generation SHALL each be idempotent: ordinary ticks skip after success; a forced rerun may refresh AI-generated outputs but SHALL preserve confirmed content and SHALL not duplicate rows or cards. The stable result keeps `project_drafts_updated` as the number of Project summaries updated and adds `project_summaries_updated`, `daily_diaries_updated`, `daily_diaries_preserved`, `daily_diaries_fallback`, and `daily_highlight_updated` as non-negative integers. The scheduler SHALL execute in two explicit stages: all project summaries and Daily diaries for every project, then all existing gated Kanban work, then a single SQLite transaction for the global Daily highlight and durable scheduler success state. A per-project generated fallback is not a run failure. If that final transaction fails, it SHALL roll back its highlight/success-state effects; Core SHALL then attempt a separate durable terminal-failure write. If that write succeeds, the response and persisted scheduler state are `failed`; if it cannot be written, the response is still `failed`, `daily_highlight_updated` is `0`, and it SHALL include the safe diagnostic code `failure_state_not_persisted` rather than claim durable failure. A later retry remains safe because per-project writers are idempotent and confirmed content is protected.

#### Scenario: Scheduled run summarizes the completed Taipei day

- **WHEN** the enabled scheduler becomes eligible at 01:00 on Taipei date `D+1`
- **THEN** it claims, generates and persists outputs for Taipei date `D`, and later ordinary ticks for that target date do not duplicate or replace its outputs.

#### Scenario: Same-target-day ordinary tick does not duplicate outputs

- **WHEN** an enabled scheduler already recorded a successful run for target date `D` and a later non-forced tick resolves to `D`
- **THEN** it returns the existing skipped result and does not generate another Project summary, Daily diary, Daily highlight, or Kanban batch.

#### Scenario: Forced rerun retains manual content

- **WHEN** an operator explicitly forces a scheduler rerun and one or more Daily diary values for resolved target date `D` are confirmed
- **THEN** Core may refresh only AI-generated output for `D`, preserves confirmed values, keeps one durable row per project/date and one `daily_logs` row for `D`, and reports preserved versus updated output counts.

#### Scenario: Scheduler-level persistence fails after project work

- **WHEN** the final SQLite transaction for the Daily highlight and success state fails
- **THEN** that transaction contributes no committed highlight or success state, Core returns `failed` with no claimed highlight update, and it persists a separate terminal `failed` state when possible; when that second write also fails it reports `failure_state_not_persisted` and does not claim durable failure. A later retry remains safe because completed per-project writes are idempotent and confirmed content is protected.

## Impacted Readers and Writers

- Writers: `DailySchedulerRuntime.runNow`, `regenerateProjectDiaryEntryWithAgent`, scheduler final transaction.
- Readers/consumers: configured diary-agent prompt runners, scheduler status, Daily diary views, daily exports.

## Compatibility and Migration

- No schema migration. Existing rows remain valid and are not rewritten automatically.
- Explicit manual date routes remain compatible.
- Scheduler status `last_run_date` now identifies the completed target date rather than the wall-clock execution date.

## Verification Mapping

- Scheduler target-date, lease and idempotency: `core/test/dailyScheduler.test.ts`.
- Shared prompt evidence, redaction and untrusted-data boundary: `core/test/diaryAgent.test.ts` and `core/test/projectWrites.test.ts`.
- Safe runtime execution: repository-local in-memory database and deterministic agent generator; no real provider or user database.

## Open Questions

- None.
