# Delta Spec: Fix scan status and schedule Daily diary generation / dev-diary-macos-app

## 中文摘要

這是對現行 `dev-diary-macos-app` Feature Spec 的差異規格，不是完整規格。它把「掃描中」改為由 Core 回收後的真實 active operation 決定，並讓每日排程在同一天內可重複安全執行 Project summary、Daily diary 與 Daily highlight 三種輸出，同時保留使用者確認的 Daily diary。

## Baseline

- Capability: `dev-diary-macos-app`
- Current Feature Spec: `openspec/specs/dev-diary-macos-app/spec.md`
- Change: `fix-scan-status-and-daily-diary-scheduler`

## MODIFIED Requirements

### Requirement: Stable scan identity and historical cache

The system SHALL use stable source identity to deduplicate repeated scan results and SHALL cache per-file parser work by `(agent_name, file_path)` plus modification time so unchanged historical files remain eligible without an arbitrary history-count or age cutoff. The system SHALL also treat `background_scan.running_operations` as recoverable Core-owned lifecycle state. A newly persisted operation MUST contain `operation_id`, `scope`, `project_id`, `started_at`, `owner_instance_id`, `owner_pid`, `heartbeat_at`, and `deadline_at`; `owner_instance_id` is a process-start UUID, `owner_pid` is a positive local PID, and the three time fields are ISO timestamps. `running_operations` returned by Core contains only this normalized live shape. Legacy records without all ownership fields, malformed records, a non-live PID, or an expired `deadline_at` are recovered, removed from the active array, and appended only as sanitized metadata in `last_recovered_operation` (`operation_id`, `scope`, `project_id`, `started_at`, `recovered_at`, `reason` where reason is `legacy_unowned`, `malformed`, `owner_not_live`, or `deadline_expired`); they MUST NOT be represented as a successful scan or extend `last_completed_at`/`next_due_at`. Each route or background cycle that records a start SHALL attempt exactly one terminal finish record in a `finally`-equivalent path for success, scan failure, cancellation, and thrown errors. Before Core returns scan state to the UI or starts a new operation, it SHALL reconcile persisted operations. Reconciliation SHALL remove only the orphaned operation, preserve independently live concurrent operations, and retain existing newest-terminal completion ordering.

#### Scenario: A completed process leaves a stale operation

- **WHEN** Core reads scan state containing an operation whose owner is no longer live or whose valid activity deadline has elapsed
- **THEN** Core removes that operation from the reconciled active set, records a sanitized recovered/failed terminal outcome, retains any other live operation, and the next settings or scan response does not report the stale operation as active.

#### Scenario: A live concurrent scan remains visible during another recovery

- **WHEN** one persisted operation is orphaned while another operation has a live owner and valid heartbeat
- **THEN** reconciliation removes only the orphaned operation, the live operation remains in the active set, and completion ordering still uses the newest terminal operation as the next-background-due base.

#### Scenario: A scan throws after recording start

- **WHEN** a global, project, or background scan throws or returns a failure after its start record exists
- **THEN** its terminal record removes its own operation from the active set, returns the existing safe error contract, and does not leave the Footer permanently busy.

### Requirement: Date-scoped diary and AI draft recovery

The system SHALL keep daily diary reads, saves, and regenerations pinned to the selected date; it SHALL support Core-backed Claude Code, Codex CLI, enabled Antigravity CLI, and configured local Ollama providers where available, and SHALL return a deterministic fallback draft on provider failure, timeout, or disabled state. A Daily diary is persisted in `project_daily_diaries` with exactly one row per `(project_id, date)`, `markdown`, `status` (`ai_generated` or `confirmed`), `fallback_report`, and timestamps; the `(project_id, date)` unique constraint is the source of truth for confirmation. `daily_logs.per_project_summary` remains a backwards-compatible Daily highlight supporting snapshot, not the source of truth for each project's diary status. Daily Markdown export SHALL read `project_daily_diaries` first for the requested date and use legacy `daily_logs.per_project_summary` only where that table has no row; redacted backup SHALL include `project_daily_diaries` as a separate app-owned collection. An eligible daily scheduler run SHALL invoke the same Core-owned date-scoped Daily diary generation path once for each project for the run date, using `ai_prompts.daily_diary_entry` and a distinct Daily-diary generator/configuration path. It SHALL create or refresh only `ai_generated` rows. The write SHALL conditionally re-check `status != confirmed` inside the SQLite transaction that upserts the row and return `updated` or `preserved`; it MUST NOT overwrite a `confirmed` entry, including one saved while a provider await is in progress. The Project summary and Daily diary are separate outputs and SHALL not replace one another.

#### Scenario: Scheduler creates an unconfirmed Daily diary for each project

- **WHEN** the daily scheduler performs an eligible run for date `D` and a project has no confirmed Daily diary for `D`
- **THEN** Core generates a date-`D` diary draft through the date-scoped writer using the Daily diary prompt, persists it as `ai_generated`, and reports that diary output separately from the project summary output.

#### Scenario: Scheduler preserves a confirmed Daily diary

- **WHEN** a project has a `confirmed` Daily diary for date `D` before or during the scheduler run
- **THEN** the scheduler does not call a write that replaces that entry, reports it as preserved/skipped, and may still refresh that project's separate Project summary and the global Daily highlight.

#### Scenario: Daily diary provider is unavailable

- **WHEN** the configured diary provider is disabled, unavailable, times out, or fails while the scheduler generates date `D`
- **THEN** the date-scoped writer stores the deterministic fallback as `ai_generated`, keeps any confirmed content intact, records sanitized fallback evidence, and allows the remaining daily outputs to continue.

### Requirement: Scheduler and runtime lifecycle are fail-safe

The system SHALL run ordinary in-app scheduler ticks at most once per configured local day, expose preflight and Run now status, recover from sleep-like Core gaps with a recovery tick, and use a redacted runtime manifest plus loopback validation for dynamic Core-port discovery. Scheduler date `D` is resolved by the shared `Asia/Taipei` calendar-date helper at claim time; scheduler writes, scheduler status/default reads, default `GET /api/exports/daily` date selection, and default project snapshot/date-scoped diary reads SHALL use that same `D`, including the Taipei-midnight-to-08:00 UTC interval. Explicit request dates remain exact user input and are not silently converted. A SQLite-backed `daily_scheduler_runs` record keyed by `D` SHALL atomically claim one non-forced run with `owner_instance_id`, `lease_expires_at`, and `status`; an active valid lease returns `running`, a terminal success returns ordinary `skipped`, and an expired lease is recovered as failed before a later claim. `force: true` is an operator-initiated same-day rerun and may claim a new attempt only when no valid lease exists. A background cycle MUST NOT invoke Kanban AI auto-add independently of the daily scheduler gate. For `D`, Project summary generation, unconfirmed Daily diary generation, and Daily highlight generation SHALL each be idempotent: ordinary ticks skip after success; a forced rerun may refresh AI-generated outputs but SHALL preserve confirmed content and SHALL not duplicate rows or cards. The stable result keeps `project_drafts_updated` as the number of Project summaries updated and adds `project_summaries_updated`, `daily_diaries_updated`, `daily_diaries_preserved`, `daily_diaries_fallback`, and `daily_highlight_updated` as non-negative integers. The scheduler SHALL execute in two explicit stages: all project summaries and Daily diaries for every project, then all existing gated Kanban work, then a single SQLite transaction for the global Daily highlight and durable scheduler success state. A per-project generated fallback is not a run failure. If that final transaction fails, it SHALL roll back its highlight/success-state effects; Core SHALL then attempt a separate durable terminal-failure write. If that write succeeds, the response and persisted scheduler state are `failed`; if it cannot be written, the response is still `failed`, `daily_highlight_updated` is `0`, and it SHALL include the safe diagnostic code `failure_state_not_persisted` rather than claim durable failure. A later retry remains safe because per-project writers are idempotent and confirmed content is protected.

#### Scenario: Same-day ordinary tick does not duplicate outputs

- **WHEN** an enabled scheduler already recorded a successful run for date `D` and a later non-forced tick occurs on `D`
- **THEN** it returns the existing skipped result and does not generate another Project summary, Daily diary, Daily highlight, or Kanban batch.

#### Scenario: Forced rerun retains manual content

- **WHEN** an operator explicitly forces a same-day scheduler rerun after one or more Daily diary or daily-log values are confirmed
- **THEN** Core may refresh only AI-generated output for date `D`, preserves confirmed values, keeps one durable row per project/date and one `daily_logs` row for `D`, and reports preserved versus updated output counts.

#### Scenario: Scheduler-level persistence fails after project work

- **WHEN** the final SQLite transaction for the Daily highlight and success state fails
- **THEN** that transaction contributes no committed highlight or success state, Core returns `failed` with no claimed highlight update, and it persists a separate terminal `failed` state when possible; when that second write also fails it reports `failure_state_not_persisted` and does not claim durable failure. A later retry remains safe because completed per-project writes are idempotent and confirmed content is protected.

## Impacted Readers and Writers

- Writers: `core/src/services/settings.ts`, `core/src/server.ts`, `core/src/services/backgroundRunner.ts`, `core/src/services/dailyScheduler.ts`, `core/src/services/projectWrites.ts`, and the SQLite schema/migration layer.
- Readers: `core/src/services/projects.ts`, domain/API snapshot types, shared `Asia/Taipei` default-date helper consumers (`GET /api/scheduler/daily*`, default `GET /api/exports/daily`, and default project snapshot/date-scoped diary reads), `core/src/services/exports.ts` table-first Daily diary export/backup readers, `GET /api/settings`, scan responses carrying `background_scan`, `src/App.jsx` Footer/polling state, and tests under `core/test/` plus `src/api/`.
- Persistent sources of truth: app-owned settings `background_scan`, `project_summaries`, new `project_daily_diaries`, new `daily_scheduler_runs`, and `daily_logs`; React remains a loopback API consumer only.

## Compatibility and Migration

Existing `running_operations` records lack ownership metadata. On first compatible Core read, they SHALL be treated as `legacy_unowned` and recovered rather than shown as indefinitely live; recovery preserves historical terminal fields and does not invent a successful scan. A schema migration creates `project_daily_diaries` and `daily_scheduler_runs` with their stated unique keys. Existing `daily_logs.per_project_summary` remains readable only as legacy fallback until a `project_daily_diaries` row exists for that project/date; no historical backfill is required. New Daily diary generation begins for eligible future runs or explicit forced reruns, and confirmed rows remain authoritative.

## Verification Mapping

| Requirement | Test / evidence change |
|---|---|
| Stable scan identity and historical cache | Extend settings/background/API tests for legacy/malformed/dead-owner recovery, live concurrency, finish-on-error, normalized field/API shape, and reconciled state; later Core/API smoke plus supported desktop Footer evidence. Mobile viewport validation is explicitly not applicable because the baseline capability is desktop-only. |
| Date-scoped diary and AI draft recovery | Extend schema/projects/project-writes/scheduler/export tests for migration, table-first Daily Markdown fallback, backup inclusion, prompt selection, date pinning, and confirmed-during-provider-await conditional preservation. |
| Scheduler and runtime lifecycle are fail-safe | Extend scheduler/background/schema/API tests for SQLite lease races, shared Taipei-midnight date `D` default readers, ordinary tick versus forced rerun, two-stage ordering across projects, result field compatibility, final transaction rollback plus durable-failure-write failure, and one-row-per-date idempotency; later runtime evidence and independent Verify-QA. |

## Open Questions

None.
