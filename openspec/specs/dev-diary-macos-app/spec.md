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

The system SHALL use stable source identity to deduplicate repeated scan results and SHALL cache per-file parser work by `(agent_name, file_path)` plus modification time so unchanged historical files remain eligible without an arbitrary history-count or age cutoff.

#### Scenario: Repeated scan sees an unchanged log file

- **WHEN** the same configured log file is scanned again with the same modification time
- **THEN** the cache avoids reparsing that file, preserves existing sessions, and does not create duplicate records.

### Requirement: Dashboard reflects persisted Core data

The system SHALL expose a range-based Dashboard snapshot containing metric totals, agent token mix, project concentration, trend buckets, latest-window heatmap cells, and daily highlights derived from persisted data rather than fixed mock records.

#### Scenario: User selects the recent 24-hour range

- **WHEN** the user selects the recent 24-hour Dashboard range
- **THEN** the trend contains 24 hourly buckets based on persisted session start times, while the heatmap remains bounded to the latest 26-week window.

### Requirement: Workspace read and app-owned write paths

The system SHALL provide project detail snapshots for metrics, Kanban, diary, tokens, sessions, comments, Project Docs, and read-only Git status, and SHALL persist user writes only to app-owned data. Kanban SHALL use exactly `todo`, `in_progress`, and `done`, while project `tracking_status` remains a separate contract.

#### Scenario: User moves a Kanban card

- **WHEN** the user changes a card status in Projects Workspace
- **THEN** Core persists the new status and `status_locked_by_user`, later scans preserve the manually locked status, and no project file or Git worktree is changed.

### Requirement: Date-scoped diary and AI draft recovery

The system SHALL keep daily diary reads, saves, and regenerations pinned to the selected date; it SHALL support Core-backed Claude Code, Codex CLI, enabled Antigravity CLI, and configured local Ollama providers where available, and SHALL return a deterministic fallback draft on provider failure, timeout, or disabled state.

#### Scenario: Provider regeneration fails

- **WHEN** a diary provider is unavailable, disabled, times out, or exits with an error
- **THEN** Core returns a deterministic fallback draft, preserves existing saved content until explicit acceptance, and does not block the manual summary workflow.

### Requirement: Scheduler and runtime lifecycle are fail-safe

The system SHALL run the in-app daily scheduler at most once per configured local day, expose preflight and Run now status, recover from sleep-like Core gaps with a recovery tick, and use a redacted runtime manifest plus loopback validation for dynamic Core-port discovery. A background cycle MUST NOT invoke Kanban AI auto-add independently of the daily scheduler gate.

#### Scenario: Preferred Core port is occupied

- **WHEN** Core cannot bind its preferred loopback port or a manifest points to a dead owner process
- **THEN** Core selects a valid loopback fallback or reclaims the stale manifest, and the UI resolves the live target or reports an explicit stale/unreachable status instead of silently using a non-loopback endpoint.

### Requirement: Redacted exports and privacy boundary

The system SHALL provide a Markdown daily export and a redacted structured backup through Core export endpoints, omit estimated cost and raw database contents, and redact secret-like or private values according to the export privacy settings.

#### Scenario: User exports a backup

- **WHEN** the user requests the structured backup
- **THEN** Core returns a `devdiary-redacted-backup` artifact containing app-owned structured data and redacted values, without a raw SQLite dump or secret-like token value.

### Requirement: Packaging and desktop startup boundary

The system SHALL start the Core through the Tauri desktop shell, clean up the child process on quit, and package the macOS release with the documented manual-approval/ad-hoc-seal flow, bundled Node runtime, Applications drag-install metadata, and background-runner installation behavior.

#### Scenario: User launches the packaged app on a fresh machine

- **WHEN** the user opens the packaged app and allows it through the macOS manual approval flow
- **THEN** the shell starts a loopback Core, resolves its runtime origin, serves the UI, and does not require the user to run a separate Node installation command.

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
