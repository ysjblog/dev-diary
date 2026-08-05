# DevDiary macOS Development Diary Feature Spec

## 中文摘要

DevDiary 是 local-first 的 macOS 開發日記工具：它透過 Core Engine 讀取使用者明確設定的 CLI coding-agent 紀錄，持久化到本機 SQLite，再由 React/Tauri 介面呈現 Dashboard、Projects Workspace、日記與設定。現行契約的核心限制是：React 不直接讀專案資料夾、SQLite 或執行命令；專案資料只允許 read-only 掃描，使用者可寫入的內容只進入 app-owned data。Antigravity 的部分 token 欄位仍可能是 0 或低信心，cost calculation、raw SQLite dump、雲端同步與長時間 OS soak 都不是目前能力。

## Purpose

This capability gives a local developer one auditable view of coding-agent activity across projects. It turns configured Claude Code, Codex CLI, and Antigravity CLI records into persisted sessions, token summaries, project documents, diary drafts, comments, Kanban cards, and read-only Git snapshots. The behavior is intentionally local-first: the Core Engine owns filesystem and SQLite access, while the desktop UI consumes a versioned loopback HTTP contract. The capability is current only where the repository source and automated tests or recorded release evidence support the behavior; deferred hardening remains explicitly outside the current contract.

## Scope

- Tauri desktop shell, React UI, Node.js/TypeScript Core Engine, loopback HTTP API, and local SQLite persistence.
- First-launch settings and safe agent detection, configured project roots, CLI log scanning, project discovery, and persisted scan cache.
- Dashboard range metrics, agent mix, heatmap, trend, project concentration, and real daily highlights.
- Projects Workspace read paths plus app-owned comments, Kanban status, project summaries, and date-scoped daily diary writes.
- AI diary drafts with deterministic fallback, in-app daily scheduler, recovery tick, and optional macOS LaunchAgent background runner.
- Markdown daily export and redacted structured backup, with local runtime health and dynamic Core-port discovery.

## Non-Goals

- The system does not calculate or display estimated token cost in v1.
- The system does not export a raw SQLite database dump.
- The system does not synchronize private data to a cloud service or provide a production OAuth/account boundary.
- The system does not let React mutate project files, run mutating Git commands, or bypass Core settings and persistence.
- Developer ID notarization, fully native sidecar replacement, and long-duration packaged-app or sleep soak are deferred hardening, not current acceptance claims.
- Agent-authored Kanban wording is not the v1 contract; deterministic synthesis and gated AI suggestions are the supported behaviors.

## Actors and Permissions

- The local desktop user owns app settings and app-owned SQLite records. The user may edit comments, Kanban status, summaries, diary entries, and settings through Core-backed UI actions.
- React UI is an unprivileged client. It may call loopback Core endpoints and render returned snapshots, but SHALL NOT read project folders, SQLite, agent logs, or execute shell/Git commands directly.
- Core Engine is the trusted local boundary for configured read-only filesystem scans, parser execution, SQLite writes, agent probes, exports, scheduler work, and Git read-only snapshots.
- CLI agents and custom agents are external local providers. They are probed with safe, bounded, non-mutating commands; a disabled, unavailable, failing, or timed-out provider must not destroy the user's manually saved content.
## Requirements
### Requirement: Core-owned local data boundary

The system SHALL route filesystem reads, CLI-log parsing, Git inspection, SQLite persistence, scheduler work, exports, and app-owned writes through the local Core Engine and its loopback HTTP API; the React client MUST NOT perform those operations directly.

#### Scenario: UI reads a project snapshot through Core

- **WHEN** the user opens a project in Projects Workspace
- **THEN** React requests `/api/projects/:id` and renders the Core snapshot without reading the project folder or SQLite itself.

### Requirement: Persisted settings and safe agent configuration

The system SHALL persist project roots, excluded paths, Project Docs filename/folder rules, scan interval, provider policy, privacy, appearance, scheduler settings, prompt overrides, canonical agent source paths, enabled state, and model/reasoning preferences through the Core settings contract.

#### Scenario: User changes a project-root setting

- **WHEN** the user submits a structured settings patch
- **THEN** Core validates and persists it through `PATCH /api/settings`, and a later `GET /api/settings` returns the normalized value without executing the submitted path as a command.

### Requirement: Read-only scan and project discovery

The system SHALL scan only explicitly configured roots and allowed agent source locations, parse supported CLI records, upsert stable sessions and project records, and preserve warnings for malformed, unreadable, missing, symlink-escaping, or cyclic inputs.

#### Scenario: Global scan discovers a newly added project

- **WHEN** a configured root contains a project folder that was absent during the previous global scan
- **THEN** the next global scan re-runs idempotent root discovery and upserts the project without modifying the project folder.

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

### Requirement: Dashboard reflects persisted Core data

The system SHALL expose a range-based Dashboard snapshot containing metric totals, agent mix, project concentration, trend buckets, latest-window heatmap cells, and daily highlights derived from persisted data rather than fixed mock records. Every calendar-day and hourly bucket derived from a UTC session timestamp SHALL use `Asia/Taipei`; date-scoped token and session totals SHALL use timestamped sessions as the canonical source so legacy UTC-keyed aggregate dates cannot split one Taipei day.

#### Scenario: User selects the recent 24-hour range

- **WHEN** the user selects Taipei date `D` in the recent 24-hour Dashboard range
- **THEN** the trend contains 24 Taipei-hour buckets for `D`, the heatmap and project/session/token totals use the same Taipei date boundary, and the heatmap remains bounded to the latest 26-week window.

#### Scenario: A UTC timestamp crosses Taipei midnight

- **WHEN** sessions occur at `D-1T16:30:00Z` and `D T15:59:59Z`
- **THEN** both are attributed to Taipei calendar date `D` across Dashboard, Workspace, export and diary evidence, while a session at `D T16:00:00Z` belongs to Taipei date `D+1`.

### Requirement: Workspace read and app-owned write paths

The system SHALL provide project detail snapshots for metrics, Kanban, diary, tokens, sessions, comments, Project Docs, and read-only Git status, and SHALL persist user writes only to app-owned data. Kanban SHALL use exactly `todo`, `in_progress`, and `done`, while project `tracking_status` remains a separate contract.

#### Scenario: User moves a Kanban card

- **WHEN** the user changes a card status in Projects Workspace
- **THEN** Core persists the new status and `status_locked_by_user`, later scans preserve the manually locked status, and no project file or Git worktree is changed.

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

### Requirement: Redacted exports and privacy boundary

The system SHALL provide a Markdown daily export and a redacted structured backup through Core export endpoints, omit estimated cost and raw database contents, and redact secret-like or private values according to the export privacy settings.

#### Scenario: User exports a backup

- **WHEN** the user requests the structured backup
- **THEN** Core returns a `devdiary-redacted-backup` artifact containing app-owned structured data and redacted values, without a raw SQLite dump or secret-like token value.

### Requirement: Packaging and desktop startup boundary

The system SHALL start the Core through the Tauri desktop shell, clean up the child process on quit, and package the macOS release with the documented manual-approval/ad-hoc-seal flow, bundled Node runtime, Applications drag-install metadata, and background-runner installation behavior. Each public DMG release MUST use one new semantic version consistently across root npm metadata, npm lockfile root metadata, Tauri metadata, Cargo metadata, artifact filename, immutable Git tag, GitHub Release, and SHA-256 checksum. The release workflow MUST be manually dispatched, verify the mounted artifact before upload, and fail before publication if its requested tag, release, or expected asset already exists. The single authorized publisher MUST preflight the remote target and MUST NOT overwrite, delete, retarget, or replace an existing tag or release asset. A partial upload MUST be resumed only after readback verifies the tag/release target and every existing asset digest.

#### Scenario: User launches the packaged app on a fresh machine

- **WHEN** the user opens the packaged app and allows it through the macOS manual approval flow
- **THEN** the shell starts a loopback Core, resolves its runtime origin, serves the UI, and does not require the user to run a separate Node installation command.

#### Scenario: Maintainer publishes a new DMG version

- **WHEN** a maintainer has explicit authorization to publish a verified new release
- **THEN** the version declarations, artifact filename, immutable Git tag, GitHub Release asset, and published SHA-256 value all identify the same version and commit, while earlier release assets remain unchanged.

#### Scenario: Upload cannot complete

- **WHEN** tag push or GitHub asset creation fails after local artifact verification
- **THEN** the workflow stops without overwriting an existing release asset and reports the exact recoverable remote state before any later retry.

### Requirement: Desktop-only presentation boundary

The system SHALL present the existing desktop workspace as the only supported UI composition. It SHALL NOT define mobile-specific layout breakpoints or alternate mobile markup for the sidebar, Dashboard, Projects Workspace, Agents, Settings, dialogs, or their controls. A layout viewport narrower than 768 CSS pixels is unsupported presentation space: the existing desktop workspace may remain mounted and may overflow, but the UI SHALL NOT present a mobile-specific replacement, a narrow-screen notice, or a claim that the mobile viewport is supported. At 768 CSS pixels and wider, the existing desktop workspace SHALL remain available with its existing navigation, data-backed views, and actions.

#### Scenario: Narrow viewport does not receive a mobile layout

- **WHEN** the app is rendered in a 390 CSS-pixel-wide layout viewport
- **THEN** it does not apply mobile-specific breakpoint rules, does not mount alternate mobile markup or a narrow-screen notice, and does not claim that the viewport is a supported mobile workspace.

#### Scenario: Desktop viewport keeps the existing workspace

- **WHEN** the layout viewport is 768 CSS pixels wide or wider
- **THEN** the existing `.mac-window` desktop workspace, navigation, Dashboard, Projects Workspace, Agents, Settings, dialogs, and actionable controls remain available without a mobile-specific branch.

#### Scenario: Removing RWD rules does not change Core-backed behavior

- **WHEN** the user uses the supported desktop viewport after the CSS change
- **THEN** existing Core-backed scan, scheduler status, project, diary, settings, export, and read-only Git interactions retain their current routes and data boundary.

## Data Contracts

- **Settings source of truth:** Core settings snapshot returned by `GET /api/settings`; updates use structured `PATCH /api/settings`, with targeted canonical executable/activity-root writes where required by the probe contract.
- **Project and activity entities:** app-owned `projects`, `sessions`, `token_usage`, `daily_logs`, `comments`, `kanban_cards`, `project_docs`, and `log_file_scan_cache` records. Project `tracking_status` is `active`, `idle`, or `paused`; Kanban `status` is `todo`, `in_progress`, or `done`.
- **Snapshots:** `/api/dashboard` and `/api/projects/:id` are the read models consumed by React. Git snapshots contain branch, worktree, upstream, commit, and diff summaries and are read-only.
- **Runtime contract:** `/api/health` exposes contract version, capabilities, loopback runtime identity, and stale/unreachable state. The runtime manifest contains only the information needed to resolve a loopback port and process ownership.
- **Exports:** `/api/exports/daily` returns Markdown; `/api/exports/backup` returns a redacted structured bundle with `kind: devdiary-redacted-backup`.
- **Compatibility:** older settings values are normalized at read time where explicitly supported; stale Core route/capability mismatches are surfaced as restart/runtime guidance rather than silently treated as provider failures.

## Error and Recovery Behavior

- Empty configured roots, missing providers, malformed JSONL, unreadable files, symlink escape/cycle, missing runtime manifests, dead owner PIDs, unavailable Core, stale route versions, provider timeout, and SQLite busy conditions are represented as warnings, failed checks, or deterministic user-facing errors.
- Scan identity and cache operations are idempotent. A repeated scan does not duplicate stable sessions or unlock manually locked Kanban cards.
- UI startup retries transient Core-load failures but does not retry validation failures indefinitely. Manual diary and summary content remains available when an AI provider fails.
- Scheduler preflight separates Core health, scheduler settings, agent detection, and scan-provider readiness; Run now reports the layered outcome.
- Cancellation and explicit user rejection do not overwrite an existing saved draft. The background runner delays its first scan to avoid startup SQLite contention and follows persisted settings thereafter.

## Security and Privacy

- Project paths, agent logs, Git metadata, and app database data remain local by default. Only explicitly configured roots are scanned, and project access is read-only.
- Path-like inputs are normalized and constrained to configured roots; symlink escapes and cycles are rejected or warned. Custom-agent probes use safe argument arrays and bounded non-mutating execution.
- The UI never receives raw SQLite dumps, secret-like export values, or private path presets. Exports and diagnostics use redaction and presence/status summaries.
- Git inspection must never run mutating commands. User writes are limited to app-owned records and are not propagated into project files.
- The current contract does not claim production authentication, multi-user authorization, cloud RLS, or remote data deletion.

## Verification Mapping

| Requirement | Automated test | Runtime / manual evidence |
|---|---|---|
| Core-owned local data boundary | `src/api/coreFetch.test.js`, `src/api/projects.test.js` | local API/UI smoke from the repository release history |
| Persisted settings and safe agent configuration | `core/test/settings.test.ts`, `core/test/agentDetection.test.ts`, `core/test/customAgents.test.ts`, `src/api/settings.test.js` | Settings and agent controls were verified in the legacy review records |
| Read-only scan and project discovery | `core/test/scans.test.ts`, `core/test/cliLogParser.test.ts`, `core/test/projectDiscovery.test.ts` | CLI parser and configured-root scan evidence in legacy Delta/review records |
| Stable scan identity and historical cache | `core/test/logFileScanCache.test.ts`, `core/test/scans.test.ts` | legacy scan-history smoke recorded 129 sessions without warnings |
| Dashboard reflects persisted Core data | `core/test/dashboard.test.ts`, `src/api/dashboard.test.js` | Dashboard localhost and RWD evidence recorded in legacy review records |
| Workspace read and app-owned write paths | `core/test/projects.test.ts`, `core/test/projectWrites.test.ts`, `core/test/gitStatus.test.ts`, `src/api/appShell.test.js` | Workspace/browser evidence recorded in legacy review records |
| Date-scoped diary and AI draft recovery | `core/test/diaryAgent.test.ts`, `src/api/projects.test.js` | diary runtime smoke and fallback evidence in recent release history |
| Scheduler and runtime lifecycle are fail-safe | `core/test/dailyScheduler.test.ts`, `core/test/runtimeManifest.test.ts`, `core/test/runtimePort.test.ts`, `core/test/backgroundRunner.test.ts`, `src/api/devCoreTarget.test.js`, `src/api/settings.test.js` | packaged release and runtime-manifest QA recorded in legacy review records |
| Redacted exports and privacy boundary | `core/test/exports.test.ts`, `src/api/settings.test.js` | export artifact/redaction checks recorded in legacy review records |
| Packaging and desktop startup boundary | `core/test/runtimeHealth.test.ts`, `src/api/coreFetch.test.js` | macOS package/Finder/manual-approval evidence is historical release evidence; long-duration soak remains deferred |

## Open Questions

None for the migrated current contract. Deferred hardening is intentionally recorded in `docs/specs/MASTER.md` and `docs/specs/legacy/MIGRATION-MAP.md`; it is not silently promoted to current behavior.
