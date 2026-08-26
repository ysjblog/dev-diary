---
openspec_level: o3
template_version: owner-workflow/v1
change: harden-daily-ai-local-providers-and-project-reconciliation
reasons: external_write
---
# Technical Design: harden-daily-ai-local-providers-and-project-reconciliation

## 中文摘要

本設計把每日目標日期與租約時鐘拆開、將 Ollama 設定做成有界型別並由 UI/Core 共用、再用兩次週期性 miss 將不存在專案軟隱藏。所有 migration 都是 additive；provider 只能收到 allowlist 選項；正式 App 更新保留可回復備份。

## Context

- `core/src/services/dailyScheduler.ts` uses `input.now` in `leaseClock`, so a test/target instant also freezes lease renewal and completion timestamps.
- `core/src/services/diaryAgent.ts` posts only `model`, `prompt`, `stream`, and temperature. Real `qwen3:8b` evidence reproduced a 100/180-second adapter timeout while native bounded generation passed.
- `core/src/services/projectDiscovery.ts` inserts/updates discovered paths but never reconciles absent paths.
- `projects` child tables use `ON DELETE CASCADE`, making direct deletion incompatible with reversible cleanup.
- `formatBackgroundCycleLog` omits the Daily-diary result fields already available in `DailySchedulerRunResult`.

## Goals / Non-Goals

Goals:

- Correct real-time lease ownership and duration evidence without changing the selected Taipei target date during a run.
- Make local Ollama generation tunable and bounded through persisted Settings/API/UI.
- Remove genuinely absent projects from active work without destroying history or mistaking an unavailable root for deletion.
- Make logs distinguish provider output from fallback and report each daily output count.

Non-goals match the Proposal: no hard delete, public provider, arbitrary JSON, cloud secret, parallel fan-out, remote release, or previous-day date semantics.

## Runtime Path and Data Flow

1. UI submits a structured custom-agent object through the existing loopback settings/custom-agent API.
2. Central Origin middleware authorizes the browser request before JSON parsing; Settings normalizes every Ollama field and stores it in the separate `custom_agent_providers_v1` Settings row. The legacy `core.custom_agents` shape stays unchanged.
3. Diary-agent construction copies the normalized Ollama fields into an internal runner options object. The runner builds a fixed-prompt request body containing only allowlisted generation options, disables redirects and shares the scheduler abort signal.
4. The scheduler captures `targetNow` once for the Taipei target date. Lease claim/renew/finalize call a separate `leaseNow()` source that advances in production and is injectable in tests. Owner id plus `lease_generation` fences every write checkpoint.
5. Global scans run discovery every cycle but reconciliation first atomically claims one due period in `project_reconciliation_runs`. Each configured root reports complete/partial/unreadable; only complete readable roots may contribute observations.
6. Reconciliation directly stats every tracked `root_path` beneath an eligible root, independently of marker and discovery depth. A missing path increments once for the claimed period; the second consecutive miss sets `presence_status='missing'`. Rediscovery resets status and counters in its write transaction.
7. Normal project lists, scan candidates and scheduled AI exclude missing projects. Historical rows remain queryable for restoration/export compatibility but are not surfaced in the normal workspace.
8. Core health advertises API contract version 6 and the capabilities `agents.custom.ollama-settings`, `projects.reconciliation`, and `scheduler.daily.telemetry-v2`; the UI requires all three before enabling the new controls.

## Decisions

### Typed Ollama configuration

The API snapshot may expose optional `provider_kind: 'ollama'` and `ollama` fields on `CustomAgentSettings`, but persisted legacy custom-agent entries MUST NOT gain them. Provider data is stored in a separate versioned `app_settings` row keyed `custom_agent_providers_v1`, indexed by custom-agent id. Legacy Ollama records are recognized by the existing heuristic and merged with safe defaults at read time. Removing an agent removes its keyed provider record in the same transaction. An older Core can still parse `core.custom_agents`; it ignores the separate row, while any old-version write leaves the provider row intact.

| Field | JSON type | Default | Accepted bound / grammar | Ollama request location |
|---|---|---:|---|---|
| `endpoint` | string | `http://127.0.0.1:11434` | origin-only local/private HTTP(S), max 300 chars | URL origin + fixed `/api/generate` |
| `model` | string | `qwen3:8b` | 1–160 chars, no controls | top-level `model` |
| `thinking` | boolean | `false` | boolean only | top-level `think` |
| `timeout_ms` | integer | `120000` | 1,000–300,000 | client abort timer only |
| `num_ctx` | integer | `4096` | 512–32,768 | `options.num_ctx` |
| `num_predict` | integer | `1024` | 32–4,096 | `options.num_predict` |
| `temperature` | number | `0.2` | finite 0–2 | `options.temperature` |
| `top_k` | integer | `40` | 0–200 | `options.top_k` |
| `top_p` | number | `0.9` | finite 0–1 | `options.top_p` |
| `min_p` | number | `0` | finite 0–1 | `options.min_p` |
| `repeat_last_n` | integer | `64` | -1–32,768 | `options.repeat_last_n` |
| `repeat_penalty` | number | `1.1` | finite 0–2 | `options.repeat_penalty` |
| `seed` | integer or null | `null` | -1–2,147,483,647; null omits | `options.seed` |
| `num_thread` | integer or null | `null` | 1–256; null omits | `options.num_thread` |
| `num_gpu` | integer or null | `null` | 0–256; null omits | `options.num_gpu` |
| `keep_alive` | string | `5m` | `0` or positive integer plus `s`, `m`, or `h`, maximum `24h` | top-level `keep_alive` |
| `stop` | string array | `[]` | at most 8 items, each 1–128 chars, total at most 512, no controls | `options.stop` |

Unknown keys, numeric strings, non-finite values and partial invalid objects reject the whole mutation. `stream` is always fixed `false`; prompt/template/raw JSON are never settings.

Rejected alternative: arbitrary options JSON. It can override privacy/runtime assumptions, create unbounded resource use, and makes validation/UI recovery ambiguous.

### Local/private endpoint boundary

Accept origin-only HTTP(S) URLs whose hostname is loopback, RFC1918 IPv4, IPv6 loopback/ULA, link-local, or `.local`. Reject credentials, path other than `/`, query, fragment, control characters, and public hosts. Provider fetch MUST use `redirect: 'error'`; every 3xx becomes sanitized fallback and no redirected request is followed. The prompt is still treated as private local data; the UI warns when the endpoint is not loopback.

### Reversible project presence

Add `presence_status`, `missing_check_count`, and `last_presence_check_at` to `projects`. Add `project_reconciliation_runs(period_start PRIMARY KEY, owner_instance_id, lease_expires_at, status, started_at, completed_at, checked_roots, result_json, error)`. The latest persisted successful completion enforces the fixed seven-day cadence and two-observation threshold requested for this release. Do not reuse `ignored`, because user-ignore and system-missing remain distinguishable.

Discovery and absence observation are different operations. Marker/depth discovery finds new projects; a due reconciliation directly stats each already-tracked path under a configured root. A root is eligible only if its traversal completes without any permission/I/O/partial error. `ENOENT` for the tracked path under an eligible root is a miss; any other stat error is inconclusive and does not mutate that project.

The due caller atomically inserts or reclaims one `running` row for the period. After filesystem observation, a `BEGIN IMMEDIATE` transaction rechecks period ownership/lease and Settings cadence, applies each counter at most once, then marks the row `success`. Losing callers return `skipped`; a failed observation marks `failed` and may be safely retried without counters. This prevents two concurrent global scans from counting one week twice.

Rejected alternative: `DELETE FROM projects`. Foreign-key cascades would destroy sessions, diaries, summaries, Kanban, comments, and documents.

### Scheduler clocks

Keep `targetNow` immutable and introduce `leaseNow?: () => Date` in runtime options. Production defaults to real time. Tests can advance a deterministic clock. Renewal and completion never reuse a fixed target instant. Add `lease_generation` to `daily_scheduler_runs`; claim/reclaim increments it and every mutating stage verifies `(date, owner_instance_id, lease_generation, running, live expiry)` immediately before its transaction.

One run-scoped `AbortController` is passed to every provider runner. Renewal failure aborts in-flight fetches and sets a terminal lease-loss flag. After every awaited provider call and before every summary/diary/Kanban/database write, the scheduler checks the fence; no new provider call or persistent effect may begin after loss. An already-sent request may be aborted but is never counted as provider success or written after loss.

The existing intermediary boundaries are part of this contract, not implementation details:

- `NEW DraftExecutionContext { signal?: AbortSignal; assertLease?: () => void }` is accepted by `ProjectSummaryDraftGenerator`, `DailySummaryDraftGenerator`, `KanbanAiTextGenerator` and every prompt runner, and is forwarded by every configured provider wrapper. Ollama passes `signal` to `fetch`; CLI runners add optional `signal` to `ExecFileImpl`/`execFile` so lease loss terminates the owned child process.
- `regenerateProjectSummaryWithAgent` and `regenerateProjectDiaryEntryWithAgent` accept the context, call `assertLease` before provider invocation, immediately after the provider await, and again inside the SQLite transaction before the first statement. They return both the snapshot and the `DiaryDraftResult` outcome so the scheduler consumes the real `agent_id` and `fallback_report`.
- `KanbanAiSyncOptions` accepts the same `signal` and `assertLease`. `KanbanAiTextGenerator(prompt, context)` receives it, and `createConfiguredKanbanAiGenerator` forwards it unchanged into `DailySummaryDraftGenerator(prompt, context)` and the underlying fetch/child-process prompt runner. `syncKanbanAiCards` checks before invocation, immediately after its timeout/provider await, and inside each card-upsert transaction. Its timeout helper aborts or rejects on either timeout or the shared signal.
- `buildGlobalSummary` invokes the global generator with the same context and checks the fence after await and before `upsertDailyLog`.
- Manual API calls omit `assertLease` and keep current behavior; only scheduler-owned calls require a live fence. Abort/fence errors are not converted into deterministic content and remain terminal scheduler lease loss.

### Honest outcome telemetry

`DailySchedulerRunResult` adds one stable `telemetry` object containing `configured_provider_id`, unique `actual_agent_ids`, `elapsed_ms`, sanitized `fallback_categories`, and the following typed units:

- `project_summaries` counts projects: `{ attempted, provider_success, fallback, failed }`, where `attempted = provider_success + fallback + failed = projects.length` for a completed run.
- `daily_diaries` counts projects: `{ attempted, provider_success, fallback, failed, preserved_confirmed, skipped_no_activity }`, where `projects.length = attempted + preserved_confirmed + skipped_no_activity` and `attempted = provider_success + fallback + failed`.
- `daily_highlight` counts one run-level generation: `{ attempted, provider_success, fallback, failed, skipped }`; `attempted` is 0 or 1, `attempted = provider_success + fallback + failed`, and `attempted + skipped = 1` for a terminal completed run.
- `kanban.deterministic_cards` counts card writes: `{ inserted, updated }`. It has no provider denominator.
- `kanban.ai_invocations` counts project-level provider invocations: `{ attempted, provider_success, fallback, failed, skipped }`, where `attempted = provider_success + fallback + failed` and `attempted + skipped = projects.length` when AI auto-add is evaluated for every project.

Each provider success requires a non-fallback `agent_id`, null `fallback_report`, a live post-await fence and completion of the applicable write stage; a syntactically valid zero-card Kanban response is provider success with zero card writes. Fallback requires deterministic output with a sanitized category and completion of the applicable write stage. `KanbanAiGeneratedText` and `KanbanAiSyncResult` gain `fallback_report`/sanitized category propagation. `failed` means invocation began but timeout, abort unrelated to lease loss, transport/non-2xx, malformed response or validation prevented fallback/write completion; it carries only a sanitized category. Terminal lease loss aborts the whole run rather than returning a completed telemetry invariant. Preserved/skipped work never increments attempted. Background JSON projects these exact units and invariants rather than collapsing them into generic updated/card counts.

### API compatibility handshake

`CORE_API_CONTRACT_VERSION` and `REQUIRED_CORE_API_CONTRACT_VERSION` both advance from 5 to 6. `CORE_API_CAPABILITIES` and `REQUIRED_CORE_CAPABILITIES` both add `agents.custom.ollama-settings`, `projects.reconciliation`, and `scheduler.daily.telemetry-v2`. `runtimeManifest.ts` inherits the same Core constants. The UI MUST classify version 5 or any missing named capability as stale before showing/enabling the new provider or reconciliation controls. Tests cover new UI + old Core, new UI + partial capability list, and new UI + complete version 6 health.

## Contract Inventory

- `NEW API-only CustomAgentSettings.provider_kind`
- `NEW API-only CustomAgentSettings.ollama`
- `NEW OllamaProviderSettings`
- `NEW app_settings.custom_agent_providers_v1`
- `NEW projects.presence_status`, `missing_check_count`, `last_presence_check_at`
- `NEW project_reconciliation_runs`
- `NEW daily_scheduler_runs.lease_generation`
- `MODIFIED ProjectDiscoveryResult` with reconciliation counts
- `MODIFIED DailySchedulerRuntimeOptions` with `leaseNow`
- `MODIFIED BackgroundCycleResult` log projection with provider/count/timing evidence
- `MODIFIED ProjectSummaryDraftGenerator`, `DailySummaryDraftGenerator`, `KanbanAiTextGenerator`, prompt runners/`ExecFileImpl`, configured provider wrappers, `regenerateProjectSummaryWithAgent`, `regenerateProjectDiaryEntryWithAgent`, `KanbanAiSyncOptions`, `KanbanAiGeneratedText`, `KanbanAiSyncResult`, and `syncKanbanAiCards` with execution context, fence and observable outcome
- `MODIFIED CORE_API_CONTRACT_VERSION = 6`, UI required version 6, and three named capabilities
- Existing `PATCH /api/settings` and custom-agent routes remain the only settings writers.

## Execution Order and Failure Recovery

- Validate the entire settings patch before persistence; no partial Ollama settings write.
- Start provider timeout before fetch, set `redirect: 'error'`, merge the scheduler abort signal and always clear listeners/timers. A timeout/failure produces a non-empty sanitized fallback reason.
- Claim the scheduler lease with live time, renew every 30 seconds, abort on loss, and validate owner/generation/live expiry before each persistent effect and final transaction.
- Atomically claim one reconciliation period, observe complete roots, then recheck ownership/cadence inside `BEGIN IMMEDIATE`; only that winner mutates counters and completes the period.
- After all code/spec/test gates pass, archive/reconcile and commit the exact verified allowlist. Package only from that clean commit. Create a candidate identity receipt binding Git revision, clean worktree proof, package-input manifest digest, version, App digest and DMG digest. Before installation, stop and confirm every owned writer, create a consistent DB snapshot with SQLite Backup API, run `integrity_check`, append its digest to the receipt, then preserve and replace the App. On packaged failure, stop the new Core, restore App and DB snapshot, and only then restart/verify the old Core.

## Security and Privacy

- Protected assets: private prompt evidence, local filesystem paths, app-owned history, scheduler single-owner integrity, and installed App availability.
- Inputs: browser settings JSON, persisted legacy settings, endpoint/model/options, filesystem availability, wall-clock values, external Ollama responses.
- Sinks: local/private `fetch`, SQLite settings/project writes, background provider calls, and `/Applications/DevDiary.app` replacement.
- Controls: central Origin authorization, strict typed normalization, endpoint host allowlist, redirect denial, prompt redaction, output/time bounds, abort/fencing, parameterized SQL, complete-root/direct-path gate, period ownership, consecutive misses, additive migration, and verified SQLite/App backups.

Mandatory O3 lenses:

- Compatibility: legacy custom agents and SQLite rows normalize without losing data.
- Failure recovery: provider timeout, root outage, lease loss, migration/install failure all preserve recoverable state.
- Integration authority: only the local user may configure/call the provider; no public endpoint or hidden external write.
- Rollout: candidate-bound package, backup, packaged smoke, and no remote publication.

## Migration and Rollback

- `openDb` adds missing columns/tables idempotently and advances schema metadata. No rows are deleted.
- Legacy custom Ollama agents receive defaults at read time. Provider configuration persists in a separate versioned Settings row, so the legacy `core` JSON shape remains readable by 0.1.3; reconciliation cadence is derived from its additive run table and does not modify the legacy Settings row.
- A real 0.1.3-reader fixture MUST open the upgraded database and load `core.custom_agents`. Old writes may ignore but do not erase the separate versioned rows. Missing projects can be restored by rediscovery or an SQL-compatible status reset; historical children never move.
- Installation never backs up a live WAL database by copying only its main file. After all owned writers stop, use SQLite Backup API (or a verified checkpoint plus complete file set), run `integrity_check`, and record a digest before first upgraded packaged open.
- Failure rollback order is fixed: stop new Core; restore the old App; restore the consistent DB snapshot when the new binary opened/mutated it; restart the old Core; verify settings and history counts. The backup is retained until packaged verification passes.
- Candidate identity is invalidated by any dirty worktree, revision change, package-input manifest change, version drift, or App/DMG digest change. Invalidated candidates are rebuilt and re-smoked before `/Applications/DevDiary.app` is touched.

## Risks / Trade-offs

- Two weekly misses delay cleanup by up to two weeks, intentionally favoring data safety.
- `.local`/private-network endpoints can still be controlled by another LAN device; UI warning and explicit user configuration are required.
- Many advanced controls increase UI complexity; they live in a collapsed Advanced section with safe defaults.
- A 23:40 run can omit activity after 23:40; the user can change the existing schedule field and Run now remains available.

## Open Questions

None.
