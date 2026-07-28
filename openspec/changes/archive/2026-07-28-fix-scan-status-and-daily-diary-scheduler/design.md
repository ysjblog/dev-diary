# Technical Design: Fix scan status and schedule Daily diary generation

## 中文摘要

掃描 operation 是可復原的 Core 狀態，而不是讓 UI 猜測；每個操作帶有本機 process ownership 與有效期限，Core 在讀取時先回收確定已死的項目。每日排程重用既有 date-scoped Daily diary writer，依序產生三種不同輸出，並以資料庫狀態保護使用者已確認的內容。

## Context

- `src/App.jsx` currently marks the Footer busy when `settingsSnapshot.background_scan.running_operations.length > 0`.
- `recordScanOperation` in `core/src/services/settings.ts` persists starts and finishes, but an interruption between them leaves a durable entry without owner/liveness data.
- `core/src/server.ts` global/project routes and `core/src/services/backgroundRunner.ts` write that state; multiple local processes can share app-owned SQLite.
- `DailySchedulerRuntime.runNow` calls `regenerateProjectSummaryWithAgent`, Kanban synthesis, and `upsertDailyLog`; `regenerateProjectDiaryEntryWithAgent` is not in the scheduler path. `daily_logs` is keyed only by date, so it cannot itself carry an atomic per-project confirmed status.

## Goals / Non-Goals

### Goals

- Make Core the source of truth for active scan work and recover legacy/orphaned state safely.
- Guarantee terminal cleanup for every started scan without hiding database-busy errors.
- Generate three daily outputs through their appropriate existing boundaries and make outcomes observable.
- Preserve confirmed Daily diary and daily-log content under ordinary and forced reruns.

### Non-Goals

- No remote coordination, cross-machine locking, process-supervisor rewrite, or external cron.
- No automatic historical backfill or new daily-output UI setting.
- No raw diary/log content in diagnostics, error records, or review artifacts.

## Runtime Path and Data Flow

### Scan lifecycle

1. A global route, project route, or background cycle starts a `NEW` operation with generated id, scope/project id, `owner_instance_id`, positive `owner_pid`, `started_at`, `heartbeat_at`, and `deadline_at`; every field is persisted/normalized before it is returned. While the owner is running it renews `heartbeat_at` at least every 30 seconds and extends `deadline_at` to ten minutes after that heartbeat; terminal finish stops renewal.
2. The writer calls `recordScanOperation(start)` atomically; before mutation it reconciles known stale records without removing a live owner.
3. A `try/finally`-equivalent wrapper calls `recordScanOperation(finish)` exactly once with the same id and sanitized status for success, failure, cancellation, or thrown errors.
4. Finish removes only its own active record. Newest-terminal ordering remains the sole writer of due-time, last completion, counts, and error fields.
5. `getSettings` and scan responses invoke the same reconciliation. `src/App.jsx` renders busy only from Core-returned active operations; it has no client-only timeout/clear behavior.

### Daily scheduler

1. `DailySchedulerRuntime.runNow` obtains date `D`, applies the existing enabled/run-time/success-per-day gate, and obtains configured agents/prompts once.
2. Scheduler atomically claims a `daily_scheduler_runs` lease keyed by `D`, where `D` is Asia/Taipei date. A second runtime cannot pass the same non-forced claim; expired claims are recovered first.
3. Per project, it refreshes the separate Project summary and calls the date-scoped Daily diary writer with the distinct Daily-diary generator configured with `daily_diary_entry` and `D`.
4. The writer conditionally checks `project_daily_diaries.status` inside its post-provider-write transaction. A confirmed row is returned as preserved even if the user confirmed it during the provider await. Unavailable provider uses deterministic fallback rather than stopping unrelated projects.
5. Only after all project summary/diary work completes does the scheduler run all gated Kanban work; it then writes the Daily highlight and terminal scheduler state atomically in one transaction.
6. Existing `project_drafts_updated` remains the Project-summary count. New non-negative counters are `project_summaries_updated`, `daily_diaries_updated`, `daily_diaries_preserved`, `daily_diaries_fallback`, and `daily_highlight_updated`.

## Decisions

### D1: Reconcile in Core using owner liveness plus bounded freshness

Persist ownership metadata for newly started operations and recover only when the owner is demonstrably gone or its bounded heartbeat/deadline is invalid. A live owner with a deadline renewed from a heartbeat no more than 30 seconds old is retained; recovery may occur only after the ten-minute deadline expires or liveness is otherwise demonstrably absent. Legacy records without ownership recover at first compatible read.

**Rationale:** A client timeout can hide a real scan. Owner liveness retains a genuinely active background process while a restarted Core can remove dead-process entries.

**Alternative rejected:** React clears the spinner after a fixed delay; that contradicts persisted Core state and can show false idle during long scans.

### D2: Finish in the scan-owner boundary

Each start/finish pair is controlled by the route or background-cycle owner with `finally` semantics and a single operation id.

**Rationale:** The owner is the only layer with both the id and final scan result. Clearing all operations from a UI poll would delete unrelated concurrent work and error provenance.

### D3: Reuse the date-scoped writer with a normalized per-project table

Scheduler calls the date-scoped diary service rather than synthesizing diary content in `dailyScheduler.ts`. A migration adds `project_daily_diaries(project_id, date, markdown, status, fallback_report, created_at, updated_at, PRIMARY KEY(project_id, date))`; the writer performs its final confirmed guard with a conditional transaction.

**Rationale:** This keeps selected-date behavior, validation, prompt/provider fallback, and the app-owned data boundary in one path. `daily_logs.per_project_summary` remains supporting Daily highlight data, not the Daily diary UI contract.

### D4: Idempotency is per output, date, and SQLite lease

`daily_scheduler_runs(date PRIMARY KEY, owner_instance_id, lease_expires_at, status, started_at, completed_at, error)` atomically claims normal execution. Ordinary scheduled ticks stop after a successful date; a user-forced same-day rerun may claim only after no valid lease exists, refresh AI-generated content, preserve confirmed values, and report updated/preserved results. Scheduler date `D` comes from one shared `Asia/Taipei` helper for scheduler default reads/writes, default export, and default project/date-scoped diary views; explicit request dates remain unchanged.

## Contract Inventory

| Surface | Current contract | Planned change |
|---|---|---|
| `BackgroundScanOperation` / `BackgroundScanSettings` | id, scope, project id, start; persisted active array | `NEW` `owner_instance_id`, `owner_pid`, 30-second `heartbeat_at` renewal, ten-minute renewed `deadline_at`, and `last_recovered_operation` with constrained reason enum. |
| `recordScanOperation` | idempotent start/finish with newest completion ordering | Reconcile before mutation/read; finish removes only its id; retain bounded SQLite-busy retry. |
| scan routes / `runBackgroundCycle` | start and normal finish | `NEW` finally-safe terminal cleanup with unchanged safe errors. |
| settings/scan response / `src/App.jsx` | UI uses persisted array length | Return/use reconciled active state; no client-only stale override. |
| SQLite schema / `projects.ts` snapshot readers / exports | `daily_logs` date row and legacy per-project JSON | `NEW` `project_daily_diaries` and `daily_scheduler_runs`, migration, table-first project/Markdown-export reader, separate redacted-backup collection, and legacy fallback until replacement. |
| `DailySchedulerRuntime.runNow` | Project summary, Kanban, global highlight | `NEW` atomic lease, ordinary-versus-forced same-day rules, two-stage project-before-Kanban order, final success transaction followed by best-effort durable-failure write on rollback, and named output counters. |
| `regenerateProjectDiaryEntryWithAgent` | manual/API date-scoped writer | Reused by scheduler with `D`, distinct Daily-diary generator, and transaction-time confirmed guard. |

## Execution Order and Failure Recovery

- Add focused tests first for orphan/liveness reconciliation, 30-second heartbeat renewal/deadline extension, finish-on-throw, concurrent preservation, schema migration, table-first legacy fallback/export/backup readers, and dual-runtime scheduler lease races.
- Implement backward-compatible operation normalization; reject malformed new records rather than treating them as live.
- Wrap scan owners so finish is attempted exactly once. If its bounded state write fails, preserve the `database_busy` error and rely on later reconciliation; do not claim it succeeded.
- Call the date-scoped writer after Project summary generation with a separate generator injection/configuration. Ensure the prompt selector is `daily_diary_entry`, not `project_diary`, and re-check confirmation at commit time.
- Keep writes ordered in two stages: all project summary/diary work, then gated Kanban, then a transaction containing Daily highlight and terminal scheduler success state. On rollback, attempt a separate terminal-failure write and surface `failure_state_not_persisted` when it also fails. Test shared Taipei-midnight `D` across default readers, later retry, ordinary tick versus forced rerun, and confirmation during provider await.
- Provider fallback is a successful generated draft with fallback evidence; malformed input, DB failure, or final transaction failure produces a safe failed response without false durable-state claims.

## Security and Privacy

- Ownership metadata is local operational metadata only; never project paths, raw logs, diary/prompt body, credentials, or transcript content.
- Recovery/error messages remain sanitized before persistence and API/UI display.
- React remains a loopback Core snapshot consumer; scans remain read-only and diary output app-owned.

## Migration and Rollback

- Existing operations lack ownership metadata; first compatible read recovers/removes them from active presentation without inventing success metrics.
- New fields are optional during read normalization, then written at the next valid mutation.
- No project-data migration/backfill is required; rollback ignores new metadata safely and does not revive it as active work.

## Risks / Trade-offs

- **Live scan mistaken for stale** → require owner liveness and bounded freshness; test a live concurrent owner.
- **PID reuse/heartbeat ambiguity** → bind owner to a per-process instance id and treat uncertain state conservatively until deadline invalidates it.
- **Provider retry cost** → ordinary one-success-per-date gate; only unconfirmed diaries are generated.
- **Partial-output confusion** → distinct counters/statuses; final success only after highlight/state commit.

## Open Questions

None.
