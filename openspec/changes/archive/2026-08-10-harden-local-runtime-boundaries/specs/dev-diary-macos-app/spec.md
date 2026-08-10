---
openspec_level: o3
template_version: owner-workflow/v1
change: harden-local-runtime-boundaries
reasons: auth_authorization
---
# Delta Spec: Harden local runtime boundaries / dev-diary-macos-app

## 中文摘要

Core 必須在讀取 request body、執行 route、呼叫 provider 或寫入 SQLite 之前，以精確來源清單拒絕不受信瀏覽器請求。runtime manifest 只有在 service、loopback 位址、port 與活著的正整數 PID 全部有效且一致時才能決定動態埠；失敗走驗證過的固定埠。session 衍生日期一律使用 `Asia/Taipei`，LaunchAgent 支援檔一律放在使用者 Application Support，測試不可碰真實資料或 launchctl。

## Baseline

- Capability: `dev-diary-macos-app`
- Current Feature Spec: `openspec/specs/dev-diary-macos-app/spec.md`
- Change: `harden-local-runtime-boundaries`

## ADDED Requirements

### Requirement: Loopback browser-origin authorization is fail-closed

The Core Engine SHALL authorize every request at one central middleware before body parsing, route dispatch, provider/scanner invocation, export work, or SQLite access. An Origin-bearing browser request MUST match an exact trusted origin. The built-in trusted origins SHALL be exactly `tauri://localhost`, `http://localhost:5173`, and `http://127.0.0.1:5173`; an explicit additional development origin MUST be an origin-only `http` URL whose host is exactly `localhost` or `127.0.0.1` and whose port is explicit and valid. The system SHALL split configured tokens, trim transport whitespace, reject an empty token, parse/validate each exact origin, and then reject duplicate canonical origins, including a collision with any built-in origin. It MUST NOT accept wildcards, prefix/suffix matches, credentials, paths, queries, fragments, opaque `null`, alternate loopback spellings, non-loopback hosts, or a partially valid configuration list. An absent-Origin request SHALL remain available to native/CLI callers only when Fetch Metadata does not identify it as `cross-site`. A denial SHALL return HTTP 403 with stable error code `forbidden_origin`, SHALL NOT reflect the submitted Origin, and MUST terminate with zero downstream effects.

#### Scenario: Untrusted simple mutation is denied before effects

- **WHEN** `https://attacker.example`, `null`, `http://localhost.attacker.example`, or an unconfigured localhost port submits a simple POST to scan or forced scheduler work
- **THEN** Core returns the stable 403 envelope without an allow-origin header, and parser, route, provider, scheduler and database effect counters remain zero.

#### Scenario: Untrusted malformed JSON cannot reach the parser

- **WHEN** an untrusted Origin sends malformed JSON to a settings or app-owned write endpoint
- **THEN** Core returns `forbidden_origin` rather than a JSON parser or route error, and persisted state is unchanged.

#### Scenario: Exact packaged and development origins remain authorized

- **WHEN** the caller uses an exact built-in origin or a valid explicitly configured worktree origin such as `http://localhost:5180`
- **THEN** trusted preflight returns 204 with the exact allow-origin value and the subsequent authorized request follows its existing route contract.

#### Scenario: Untrusted read and preflight are denied centrally

- **WHEN** an untrusted Origin sends GET to health/read data or OPTIONS to any path
- **THEN** both return `forbidden_origin` before dispatch, without an allow-origin header; trusted OPTIONS still returns 204 and invokes no parser/route.

#### Scenario: Invalid development-origin configuration fails before serving

- **WHEN** any configured additional-origin token is empty, duplicated, wildcarded, non-HTTP, missing a port, out of range, non-loopback, contains credentials/path/query/fragment, or is not exactly its parsed origin
- **THEN** server construction fails with a configuration error and does not silently accept the remaining tokens or broaden trust.

#### Scenario: Cross-site Fetch Metadata cannot use the no-Origin compatibility path

- **WHEN** a request omits Origin but sends `Sec-Fetch-Site: cross-site`
- **THEN** Core returns `forbidden_origin` before route work; a native/CLI request with neither Origin nor cross-site Fetch Metadata retains existing behavior.

#### Scenario: No-Origin CLI methods retain the deliberate compatibility path

- **WHEN** a native/CLI caller sends GET, an otherwise valid mutation, or OPTIONS without Origin and without `Sec-Fetch-Site: cross-site`
- **THEN** Core follows the existing read/mutation contract or returns 204 for OPTIONS, without emitting an allow-origin header.

### Requirement: Session-derived calendar projections use Asia/Taipei safely

Every calendar date label, date bucket, or wall-clock hour bucket derived from a UTC `sessions.start_time` timestamp SHALL use `Asia/Taipei`, including Dashboard, Workspace, scheduler material, date-scoped exports, Daily-diary prompt evidence and Kanban synthesis/AI evidence. Complete ISO session timestamps shown as audit facts MAY remain UTC only when they retain their explicit `Z` suffix and are not used as calendar labels or selection/grouping keys. Stored UTC session timestamps SHALL remain unchanged. Internal SQLite date/hour projection helpers MUST accept only trusted qualified identifiers matching `^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$` and MUST reject SQL fragments or user-controlled expressions. Date-scoped historical totals SHALL continue to use timestamped sessions as the canonical source rather than claiming that legacy aggregate keys were migrated.

#### Scenario: Session evidence crosses Taipei midnight

- **WHEN** a session starts at `2026-06-30T15:59:59Z`, `2026-06-30T16:00:00Z`, or `2026-06-30T17:30:00Z`
- **THEN** its calendar label is respectively `2026-06-30`, `2026-07-01`, and `2026-07-01` across queries, exports and bounded diary/Kanban evidence.

#### Scenario: SQL projection input is not an expression escape hatch

- **WHEN** an internal caller requests a Taipei SQL projection for `s.start_time` or supplies whitespace, quoting, parentheses, comments, operators, or another SQL fragment
- **THEN** the qualified identifier is rendered for the first case and the fragment, a leading digit, consecutive dots, or a trailing dot is rejected before SQL preparation for every other case.

#### Scenario: Full export timestamp remains an explicit UTC audit fact

- **WHEN** a Daily Markdown export selects sessions by Taipei date and renders a session's complete ISO start timestamp
- **THEN** selection/grouping uses Taipei while the complete audit timestamp remains unchanged with `Z` and is never compared as the exported calendar date label.

#### Scenario: Existing UTC facts are not destructively migrated

- **WHEN** the upgraded Core reads existing sessions or compatibility `token_usage` rows
- **THEN** it keeps source timestamps/rows intact and derives date-scoped truth from timestamped sessions under the current Feature Spec.

### Requirement: Runtime manifest routing requires live process identity

The JS development proxy and Rust/Tauri shell SHALL trust a Core runtime manifest only when it is valid JSON for service `devdiary-core`, `runtime.host` is exactly `127.0.0.1` or `localhost`, `runtime.port` is an integer in `1..65535`, and `runtime.pid` is a numeric positive integer whose process is live. The runtime object SHALL be canonical; when top-level `url` is present, its HTTP origin MUST exactly match the runtime origin. Missing, string, zero, negative, dead or malformed PIDs, wrong services, non-loopback hosts, invalid ports, malformed JSON, and URL/runtime disagreement MUST be treated as invalid. Invalid or absent manifests SHALL use an explicitly configured fallback port only when it is an integer in `1..65535`, otherwise port `4317`; consumers MUST NOT delete or rewrite the manifest.

#### Scenario: Current live manifest selects the dynamic Core port

- **WHEN** a manifest names `devdiary-core`, loopback host, valid dynamic port, numeric live PID and a matching optional top-level URL
- **THEN** JS and Rust resolve the same runtime origin.

#### Scenario: Missing or invalid owner identity is not backward-compatible authority

- **WHEN** the same otherwise valid manifest has a missing, string, zero, negative or dead PID
- **THEN** JS and Rust reject it and resolve their validated fixed-port fallback instead.

#### Scenario: Redundant URL cannot redirect one consumer

- **WHEN** runtime host/port are valid but top-level `url` names another port or origin
- **THEN** every consumer rejects the whole manifest rather than selecting different origins.

#### Scenario: Invalid fallback port is bounded

- **WHEN** no manifest is valid and the configured fallback port is missing, non-numeric, fractional, non-positive or greater than 65535
- **THEN** JS and Rust resolve `http://127.0.0.1:4317`.

### Requirement: Background-runner support files stay in the user data boundary

The macOS shell SHALL generate the background launcher and source plist below `<Application Support>/DevDiary/LaunchAgents` for both packaged and development Core paths, SHALL keep logs below the same app-data boundary, and SHALL register the stable label `com.ysjblog.devdiary.background` through a link at `~/Library/LaunchAgents`. It MUST validate the source plist before replacing registration, MUST limit legacy cleanup and failure cleanup to files carrying DevDiary ownership markers or the exact link created by the current attempt, and MUST return/log a failure without deleting unrelated files. Unit tests MUST use pure paths or temporary directories and MUST NOT invoke real `launchctl`, modify the user's HOME, or install/uninstall an agent.

#### Scenario: Drag-installed app uses a standard-user writable source directory

- **WHEN** Core resolves from `/Applications/DevDiary.app/Contents/Resources/core`
- **THEN** launcher and source plist resolve below the current user's DevDiary Application Support directory, not `/Applications` or the app bundle's parent.

#### Scenario: Development and packaged registration use the same layout

- **WHEN** background registration is prepared for a development or packaged Core path
- **THEN** both use the same app-data source layout and the same per-user registration-link contract.

#### Scenario: Invalid staged plist does not replace registration

- **WHEN** source plist validation fails before bootstrap
- **THEN** the installer reports failure before replacing the per-user registration and does not invoke bootstrap.

#### Scenario: Failed current attempt cannot delete unrelated registration

- **WHEN** link creation or bootstrap fails and the registration path no longer points to the exact source from the current attempt
- **THEN** cleanup leaves that path untouched and reports the incomplete installation.

## Impacted Readers and Writers

- Readers: every Core HTTP route, JS `resolveCoreApiTarget`/`buildCoreProxyUrl`, Rust `resolve_core_api_origin`, session-derived diary/Kanban evidence, Dashboard/Workspace/export/scheduler queries, launchd registration.
- Writers/effectors: Core route handlers and provider/scanner calls after authorization; Core runtime-manifest writer remains unchanged; scan token delta writer remains unchanged; Tauri background support-file installer changes path/order only.
- New persistent writers: none.

## Compatibility and Migration

- Authorized HTTP response/request schemas remain unchanged; untrusted browser requests intentionally gain a stable 403 denial.
- No SQLite migration, raw timestamp rewrite, aggregate rebuild or private data access.
- Current Core manifests already contain numeric live PIDs. Legacy missing-PID manifests intentionally lose dynamic-port authority and use a safe fallback.
- The stable LaunchAgent label and per-user registration path remain; only generated source storage and failure ordering change. Actual installed-app migration is not executed or claimed by this Change.
- Desktop-only support remains; no mobile requirement is introduced.

## Verification Mapping

- Origin configuration/order/bypass/effects: `core/test/runtimeHealth.test.ts` plus NEW focused Core origin-policy/integration cases covering representative and enumerated mutation methods.
- Taipei helper/evidence/aggregate boundaries: `core/test/dashboard.test.ts`, `projects.test.ts`, `dailyScheduler.test.ts`, `exports.test.ts`, `scans.test.ts`, `diaryAgent.test.ts`, `kanbanSynthesis.test.ts`, and `kanbanAiSuggestions.test.ts` where present.
- Runtime identity and fallback parity: `src/api/devCoreTarget.test.js` and Rust tests in `src-tauri/src/lib.rs`.
- LaunchAgent paths/order/cleanup: Rust pure-function and temporary-directory tests; no real launchctl.
- Observable outcome: repository-owned in-memory localhost smoke, supported desktop UI capture, independent black-box QA and security/authorization closer bound to the same revision.

## Open Questions

None.
