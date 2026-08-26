---
openspec_level: o3
template_version: owner-workflow/v1
change: harden-daily-ai-local-providers-and-project-reconciliation
reasons: external_write
---
# Delta Spec: DevDiary macOS Development Diary

## 中文摘要

新增三個相互配合的穩定性契約：Ollama 的 host 與推論選項由使用者設定且經 Core 嚴格驗證；每日排程以固定目標日期配合持續前進的租約時鐘；已不存在的專案經兩次週檢查後只做可恢復隱藏，不刪除歷史。

## Baseline

Capability: `dev-diary-macos-app`

Current Feature Spec: `openspec/specs/dev-diary-macos-app/spec.md`

## ADDED Requirements

### Requirement: Configurable local Ollama generation is bounded and explicit

The system SHALL let the local user configure a custom Ollama Diary Agent's origin-only local/private endpoint, model, thinking mode, request timeout, context window, maximum predicted tokens, temperature, top-k, top-p, min-p, repeat window/penalty, optional seed, optional CPU/GPU hints, keep-alive value, and bounded stop sequences through the Core-backed Settings UI/API. Core MUST normalize the complete object against the typed defaults/bounds in Design before persistence and MUST pass only that documented allowlist to `/api/generate`; it MUST NOT accept credentials, a public host, a path other than `/`, query, fragment, control characters, redirects, arbitrary request JSON, a custom template, or a prompt override through provider options. Provider fetch MUST use `redirect: 'error'`. Missing fields on a legacy Ollama custom agent SHALL receive finite safe defaults. Provider configuration MUST persist outside the legacy `core.custom_agents` JSON shape in `custom_agent_providers_v1`, so a 0.1.3 reader can still load upgraded settings. Provider absence, non-2xx/3xx, malformed output, timeout, abort, or lease loss SHALL return a deterministic fallback or terminal lease-loss result with a non-empty sanitized reason and SHALL preserve confirmed/manual content.

#### Scenario: User configures a bounded thinking model

- **WHEN** the user selects an Ollama custom agent with a loopback endpoint, `qwen3:8b`, thinking disabled, finite timeout/context/output values and valid sampling options
- **THEN** Core persists the normalized settings in the versioned provider row and the actual `/api/generate` request contains the selected model, top-level thinking/keep-alive controls and only the allowlisted bounded generation options.

#### Scenario: Endpoint or option tries to escape the local boundary

- **WHEN** settings contain credentials, public host, path/query/fragment, control characters, non-finite/out-of-range values, unknown Ollama keys, oversized stop lists, arbitrary JSON, or the accepted endpoint responds with a redirect
- **THEN** Core rejects invalid settings before persistence and no provider request occurs; for a runtime redirect, the original request fails closed and no redirected request is followed.

#### Scenario: Legacy Ollama custom agent remains usable

- **WHEN** Core reads a pre-change custom agent identified as Ollama but lacking provider settings
- **THEN** it exposes normalized safe defaults without changing the persisted legacy agent shape; a real 0.1.3 reader can still load that upgraded database and any provider write remains isolated in the versioned row.

### Requirement: Scheduler target date and lease time are independent and observable

The system SHALL capture one immutable `Asia/Taipei` target-date instant for each run while lease claim, renewal, expiry checks and completion timestamps use a live clock that advances for the duration of the work. A long-running owner that successfully renews MUST retain ownership; a different owner MUST NOT reclaim it merely because provider work exceeds the original lease duration. Owner id plus monotonically incremented lease generation SHALL fence every provider/mutating stage. Renewal failure MUST abort in-flight provider work and no later provider call or persistent effect may begin under that stale owner. The abort signal and lease assertion MUST cross every prompt runner, project/daily/Kanban generator, configured wrapper, `projectWrites`, global-summary and Kanban intermediary boundary; each boundary checks before invocation, immediately after await, and inside the write transaction. Fetch and owned CLI child processes MUST receive the shared abort signal. The persisted/background result SHALL report real elapsed time, configured provider id, actual agent ids, sanitized fallback categories, and the exact typed units/equations from Design for Project summary projects, Daily diary projects, one run-level highlight, deterministic Kanban card writes and project-level Kanban AI invocations. An attempted provider operation MUST end in exactly one of provider success, committed deterministic fallback, or failed; terminal lease loss aborts the run and is not misreported as a completed invariant.

#### Scenario: Provider work exceeds the initial lease duration

- **WHEN** a run targets Taipei date `D`, provider work continues beyond the initial lease, and the live owner renews at the configured interval
- **THEN** target date remains `D`, lease expiry and completion advance with real time, no second owner can claim `D`, and final elapsed time is non-zero.

#### Scenario: Owner loses its lease during provider work

- **WHEN** renewal fails or another generation becomes authoritative while a provider request is in flight
- **THEN** the stale runner aborts, starts no later provider call, passes no later write fence, records no provider success for that result, and a valid new owner can proceed without interleaved stale writes.

#### Scenario: Provider is unavailable before invocation

- **WHEN** the selected provider is disabled, unresolved, unreachable, or rejected before generation
- **THEN** affected outputs use deterministic fallback with a non-empty safe reason and run telemetry does not claim provider-generated success.

#### Scenario: Provider returns immediately before lease loss is observed

- **WHEN** an intermediary awaits provider output and the scheduler loses its lease before the subsequent SQLite write
- **THEN** the post-await or in-transaction assertion throws terminal lease loss, no returned draft/card is persisted, and no provider-success counter increments.

#### Scenario: Kanban provider fails after invocation

- **WHEN** a Kanban provider invocation times out, returns malformed output or otherwise fails without a committed deterministic fallback
- **THEN** the invocation increments `attempted` and `failed` exactly once with a sanitized category, increments neither provider success nor fallback, writes no AI card, and preserves the telemetry equation from Design.

### Requirement: New local-provider UI rejects an old Core runtime

The system SHALL advertise Core API contract version 6 and capabilities `agents.custom.ollama-settings`, `projects.reconciliation`, and `scheduler.daily.telemetry-v2`. The UI SHALL require version 6 and all three capabilities before enabling or submitting the new provider/reconciliation controls. Version 5, a missing capability, or a stale runtime manifest MUST be classified as stale with no settings mutation.

#### Scenario: New UI reaches a still-running 0.1.3 Core

- **WHEN** health reports API contract version 5 or omits any required new capability
- **THEN** the UI reports stale Core, does not show the runtime as connected for these controls, and sends no provider/reconciliation settings write.

#### Scenario: Version 6 Core exposes the complete capability set

- **WHEN** health and runtime manifest agree on version 6 and all required capabilities
- **THEN** the UI enables the new settings and normal validation/persistence may proceed.

### Requirement: Missing-project reconciliation is reversible and root-aware

The system SHALL periodically reconcile tracked project paths no more often than once every seven days, using the persisted latest successful reconciliation as the cadence source. One caller MUST atomically own each due observation period; concurrent losing callers skip without changing counters. Only a configured root that is currently present, readable and completely traversed without partial/I/O/permission errors may contribute a missing observation. For already tracked projects, presence is decided by a direct path stat independent of discovery markers and maximum depth: `ENOENT` under an eligible root is a miss, any other stat error is inconclusive. A tracked project SHALL become `missing` only after two consecutive observations from two distinct successful periods. Missing projects MUST be excluded from normal project lists, scans and scheduled AI work without deleting or modifying their sessions, diaries, summaries, Kanban, comments or documents. Rediscovery SHALL atomically restore the project to `present`, clear missing counters/timestamps and make it eligible again. User-ignore state MUST remain distinct.

#### Scenario: Project is absent for two weekly readable-root checks

- **WHEN** a tracked child is absent from the same readable configured root on two due reconciliations
- **THEN** the first check records one miss without hiding it, the second marks it missing, normal scan/AI lists exclude it, and all child-record counts remain unchanged.

#### Scenario: External or configured root is temporarily unavailable

- **WHEN** the root itself is missing, unreadable, or traversal fails at a due reconciliation
- **THEN** no child under that root gains a missing observation and existing presence state/history remains unchanged.

#### Scenario: Concurrent callers observe the same due period

- **WHEN** two global scans both see reconciliation as due
- **THEN** one durable owner applies at most one observation per tracked project and completes the period while the loser skips; the pair cannot satisfy a two-period threshold.

#### Scenario: Existing path no longer matches discovery marker or depth

- **WHEN** a tracked project path still exists but its marker changes or it is outside the current discovery depth
- **THEN** its direct path observation resets/retains present state and MUST NOT count as missing.

#### Scenario: Missing project returns

- **WHEN** a missing project path is rediscovered under a readable configured root
- **THEN** Core restores it to present in the same discovery transaction, resets absence metadata, and the next normal list/scan can include it without recreating historical rows.

## Impacted Readers and Writers

- Writers: Settings/custom-agent routes, `openDb` compatibility patch, project discovery/reconciliation, scheduler lease/finalization and background log formatting.
- Readers/writers at the provider boundary: Diary-agent generator interfaces, `projectWrites` regeneration functions, global-summary construction, Kanban AI sync and their scheduler callers.
- Compatibility readers/writers: `runtimeHealth.ts`, `runtimeManifest.ts`, UI health classification, Settings/Agents UI and API contract tests.
- Other readers: project list/detail, scan candidate selection, scheduler project selection, background diagnostics and redacted backup compatibility.
- External sink: configured local/private Ollama `/api/generate` only after normalized settings and existing central browser-origin authorization.

## Compatibility and Migration

- Additive SQLite columns only; no project or child row deletion.
- Legacy custom agents receive defaults at read time; provider settings use `custom_agent_providers_v1` and do not mutate the strict legacy agent record.
- Existing user-selected scheduler time remains supported. This authorized local rollout changes only the current user's setting to `23:40`.
- A 0.1.3 reader fixture must load the upgraded `core` row; older binaries ignore the separate versioned Settings rows and additive columns/tables. Rollback follows the verified App plus SQLite-consistent database snapshot procedure in Design.

## Verification Mapping

- Ollama normalization/execution/security: `core/test/settings.test.ts`, `core/test/diaryAgent.test.ts`, `core/test/customAgents.test.ts`, `src/api/settings.test.js`, live adapter smoke.
- Scheduler live clock/fencing/telemetry: `core/test/dailyScheduler.test.ts`, `core/test/projectWrites.test.ts`, `core/test/kanbanAiSuggestions.test.ts`, `core/test/backgroundRunner.test.ts`, local background/API smoke.
- API compatibility: Core runtime-health/manifest tests and `src/api/settings.test.js` version 5/missing-capability/version 6 cases.
- Missing projects: `core/test/projectDiscovery.test.ts`, `core/test/scans.test.ts`, `core/test/projects.test.ts`, concurrent-period and migration/runtime fixture smoke.
- UI: `src/api/appShell.test.js` plus supported desktop browser capture and independent black-box QA.

## Open Questions

None.
