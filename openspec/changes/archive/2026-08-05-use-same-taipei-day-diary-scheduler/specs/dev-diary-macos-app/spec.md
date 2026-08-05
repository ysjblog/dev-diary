---
openspec_level: o1
template_version: owner-workflow/v1
change: use-same-taipei-day-diary-scheduler
reasons: durable_shared_contract, multiple_journeys_roles
---
# Delta Spec: Use same Taipei day for diary scheduler / dev-diary-macos-app

## 中文摘要

所有以 session timestamp 推導的日／小時統一使用 `Asia/Taipei`。排程整理執行當日截至當下已掃描的 activity；只有目標日已有 session 的專案進入 scheduled AI work。UI fallback 不等同持久化 AI diary，舊 scheduler 語意的 success 也不能阻止新規則首次執行。

## Baseline

- Capability: `dev-diary-macos-app`
- Current Feature Spec: `openspec/specs/dev-diary-macos-app/spec.md`
- Change: `use-same-taipei-day-diary-scheduler`

## MODIFIED Requirements

### Requirement: Dashboard reflects persisted Core data

The system SHALL expose a range-based Dashboard snapshot containing metric totals, agent mix, project concentration, trend buckets, latest-window heatmap cells, and daily highlights derived from persisted data rather than fixed mock records. Every calendar-day and hourly bucket derived from a UTC session timestamp SHALL use `Asia/Taipei`; date-scoped token and session totals SHALL use timestamped sessions as the canonical source so legacy UTC-keyed aggregate dates cannot split one Taipei day.

#### Scenario: User selects the recent 24-hour range

- **WHEN** the user selects Taipei date `D` in the recent 24-hour Dashboard range
- **THEN** the trend contains 24 Taipei-hour buckets for `D`, the heatmap and project/session/token totals use the same Taipei date boundary, and the heatmap remains bounded to the latest 26-week window.

#### Scenario: A UTC timestamp crosses Taipei midnight

- **WHEN** sessions occur at `D-1T16:30:00Z` and `D T15:59:59Z`
- **THEN** both are attributed to Taipei calendar date `D` across Dashboard, Workspace, export and diary evidence, while a session at `D T16:00:00Z` belongs to Taipei date `D+1`.

### Requirement: Date-scoped diary and AI draft recovery

The system SHALL keep daily diary reads, saves, and regenerations pinned to the selected `Asia/Taipei` calendar date; it SHALL support Core-backed Claude Code, Codex CLI, enabled Antigravity CLI, and configured local Ollama providers where available, and SHALL return a deterministic fallback draft on provider failure, timeout, or disabled state. A Daily diary is persisted in `project_daily_diaries` with exactly one row per `(project_id, date)`, `markdown`, `status` (`ai_generated` or `confirmed`), `fallback_report`, and timestamps; the `(project_id, date)` unique constraint is the source of truth for confirmation. `daily_logs.per_project_summary` remains a backwards-compatible Daily highlight supporting snapshot, not the source of truth for each project's diary status. A generated read-model fallback shown for a session day with no persisted diary row SHALL NOT be represented as AI-generated or scheduler-persisted content. Daily Markdown export SHALL read `project_daily_diaries` first for the requested date and use legacy `daily_logs.per_project_summary` only where that table has no row; redacted backup SHALL include `project_daily_diaries` as a separate app-owned collection. Manual date-specific regenerate and an eligible daily scheduler run SHALL invoke the same Core-owned date-scoped Daily diary generation path and shared prompt evidence builder for the same project/date. Scheduled AI work SHALL be limited to projects that have at least one persisted session whose Taipei calendar date equals the resolved scheduler target date at execution time; Workspace five-day `tracking_status` MUST NOT determine eligibility. The evidence builder SHALL include bounded, redacted session command/summary evidence and date-scoped recent commit titles when available, SHALL treat every evidence value as untrusted data rather than instructions, and MUST exclude raw transcripts, `source_log_ref`, absolute project paths, credentials and secret-like values. Every valid persisted prompt override up to the settings contract limit SHALL retain the appended safety constraints and complete generated `STRUCTURED_DATA`; runtime prompt budgeting MUST NOT silently truncate those trailing sections. The scheduler SHALL invoke that path once for each eligible project using `ai_prompts.daily_diary_entry` and a distinct Daily-diary generator/configuration path. It SHALL create or refresh only `ai_generated` rows. The write SHALL conditionally re-check `status != confirmed` inside the SQLite transaction that upserts the row and return `updated` or `preserved`; it MUST NOT overwrite a `confirmed` entry, including one saved while a provider await is in progress. The Project summary and Daily diary are separate outputs and SHALL not replace one another.

#### Scenario: Same-date manual and scheduled generation use the same Taipei evidence

- **WHEN** a project has sessions on Taipei date `D`, and the user manually regenerates date `D` or the scheduler generates date `D`
- **THEN** both paths provide the diary agent with the same bounded redacted session/commit evidence fields for `D`, including sessions that cross UTC midnight, without raw transcript, `source_log_ref`, absolute paths or secrets.

#### Scenario: Scheduler skips a project with no target-date activity

- **WHEN** a tracked project has no persisted session on Taipei target date `D` at scheduler execution time
- **THEN** scheduler does not invoke Daily diary generation for that project and does not create a `project_daily_diaries` row containing a data-insufficient placeholder; existing Project summary and Kanban stages remain governed by their existing contracts.

#### Scenario: UI fallback is not persisted AI output

- **WHEN** a target date has sessions but no `project_daily_diaries` row
- **THEN** Workspace may render its deterministic session-count fallback, but Core persistence and scheduler status do not identify that fallback as AI-generated diary content.

#### Scenario: Confirmed content remains protected

- **WHEN** an eligible project already has a `confirmed` diary for target date `D`
- **THEN** scheduled or forced same-day generation preserves its content and status while reporting it as preserved.

### Requirement: Scheduler and runtime lifecycle are fail-safe

The system SHALL run ordinary in-app scheduler ticks at most once per configured target day and current scheduler semantics version, expose preflight and Run now status, recover from sleep-like Core gaps with a recovery tick, and use a redacted runtime manifest plus loopback validation for dynamic Core-port discovery. At or after the configured `Asia/Taipei` wall-clock run time, scheduler target date `D` is the current `Asia/Taipei` calendar date at execution; forced Run now uses the same target-date rule, while explicit project diary request dates remain exact user input. A 01:00 run therefore includes only target-date sessions persisted before that point and SHALL NOT automatically rerun when later same-day activity arrives. Scheduler writes and status use that same `D`. A SQLite-backed `daily_scheduler_runs` record keyed by `D` SHALL atomically claim one non-forced run with `owner_instance_id`, `lease_expires_at`, and `status`; an active valid lease returns `running`, a terminal success under the current semantics returns ordinary `skipped`, and an expired lease is recovered as failed before a later claim. Core SHALL persist the `NEW` internal settings marker `daily_scheduler.semantics_version` only with successful finalization. If an existing success for `D` was produced under missing or older semantics, the first eligible tick under current semantics SHALL safely reclaim `D` once without bypassing a valid lease or confirmed-content protection. `force: true` is an operator-initiated rerun for resolved target date `D` and may claim a new attempt only when no valid lease exists. For `D`, existing scheduled Project summary and Kanban stages retain their current scope, while Daily diary generation invokes only eligible target-date projects and remains idempotent under current semantics. The stable result reports non-negative updated/preserved/fallback counts for eligible Daily diary projects. The scheduler SHALL execute per-project work before one SQLite transaction for the global Daily highlight, semantics marker and durable scheduler success state. A per-project generated fallback is not a run failure. If that final transaction fails, it SHALL roll back its highlight/marker/success-state effects and preserve retry safety.

#### Scenario: Scheduler runs the current Taipei date as a point-in-time snapshot

- **WHEN** the enabled scheduler becomes eligible at 01:00 on Taipei date `D`
- **THEN** it claims and persists outputs for `D` using sessions already persisted between `D 00:00` and execution time; later ordinary ticks under the same semantics skip even if later same-day activity appears.

#### Scenario: Older scheduler meaning does not suppress the first current-semantics run

- **WHEN** `daily_scheduler_runs` already contains success for `D` but settings do not record the current scheduler semantics marker
- **THEN** the first eligible current-semantics tick may safely rerun `D`, then records the marker only with durable success; subsequent ordinary ticks skip.

#### Scenario: Run now uses the current Taipei date

- **WHEN** an operator invokes Run now at any Taipei wall-clock time on date `D`
- **THEN** Core targets `D`, processes only projects with target-date sessions present at invocation, and preserves confirmed diary rows.

## Impacted Readers and Writers

- Readers: Dashboard/project snapshots, exports, scheduler inputs, prompt evidence.
- Writers: scheduler success/settings marker; existing session/diary schemas remain unchanged.

## Compatibility and Migration

- Raw UTC `sessions.start_time` values remain unchanged.
- No destructive migration or historical diary rewrite.
- Legacy `token_usage.date` may remain for compatibility, but timestamp-derived session aggregation is authoritative for date-scoped reads.

## Verification Mapping

- Taipei date/hour and historical totals: `core/test/projects.test.ts`, `core/test/dashboard.test.ts`, `core/test/exports.test.ts`.
- Same-day target, active project filtering, transition marker, idempotency and confirmed preservation: `core/test/dailyScheduler.test.ts`, `core/test/backgroundRunner.test.ts`.
- Runtime/API outcome: in-memory SQLite plus deterministic generators and independent black-box QA.

## Open Questions

- None.
