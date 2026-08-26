---
openspec_level: o3
template_version: owner-workflow/v1
change: harden-daily-ai-local-providers-and-project-reconciliation
reasons: external_write
---
# Change Proposal: harden-daily-ai-local-providers-and-project-reconciliation

## 中文摘要

DevDiary 的每日 AI 目前會把目標日期與租約續期共用同一個固定時間，長任務可能失去真實的互斥保護；Ollama 雖可連線，但使用者無法設定 endpoint 與推論限制，thinking model 可能直到 timeout；專案 discovery 也只新增、不處理已不存在的資料夾。本 Change 將三者一起收斂成可觀察、可回復且由使用者控制的本機契約。

## Why

- Real background evidence shows daily AI runs can exceed the ten-minute lease while `started_at` and `completed_at` remain identical because the lease clock is pinned to the target-date instant.
- A real `qwen3:8b` request completed in under one second when thinking and output were bounded, but the current DevDiary adapter timed out because those settings are not configurable or sent.
- Tracked projects whose folders no longer exist remain eligible for scan and daily AI work, wasting provider calls while a direct row deletion would cascade into historical app-owned records.
- The current background JSON omits Daily-diary counts and fallback detail, so `success` cannot explain whether all outputs were created by the selected provider.

## What Changes

- Separate the immutable scheduler target-date instant from a live injectable lease clock and persist real completion time.
- Add versioned typed Ollama configuration beside the legacy custom-agent record: endpoint, model, thinking mode, timeout, context/output bounds, sampling/repetition controls, seed, CPU/GPU hints, keep-alive, and stop sequences.
- Validate Ollama endpoints as local/private-network origins, reject redirects, and pass only an explicit option allowlist to `/api/generate`.
- Add an atomic weekly reconciliation claim with two consecutive complete readable-root observations before a project is marked missing; direct path checks are independent of project markers/depth, missing projects leave normal scan/AI/read lists but retain all history, and rediscovery restores them.
- Fence scheduler effects with live lease ownership and an abort signal so a stale owner cannot continue provider or database work after lease loss.
- Emit provider-success, fallback, preserved and skipped counts for every generated output family, plus provider identities, fallback categories and elapsed time.
- Raise the Core API contract to version 6 with named provider-settings, reconciliation and scheduler-telemetry capabilities, so a new UI fails closed against an old Core.
- Package a new local App version, preserve a recoverable copy of the current installation, install it with the user's explicit authority in this request, and change this user's scheduler time to `23:40` through the Core settings contract.

## Scope

- Capability modified: `dev-diary-macos-app`.
- Core settings, custom-agent adapter, scheduler, project discovery/reconciliation, SQLite compatibility patches, loopback API, React Settings/Agents UI, tests, packaging metadata, and local installation verification.
- The provider-to-write boundary explicitly includes `diaryAgent.ts`, `projectWrites.ts`, `kanbanAiSuggestions.ts`, `dailyScheduler.ts`, `runtimeHealth.ts`, runtime manifest consumers and UI health classification.
- Existing private runtime data is used only for aggregate/read-only preflight and the explicitly authorized settings/install operations; tests use temporary or in-memory data.

## Non-Goals

- No hard deletion of projects or cascaded historical records.
- No public Ollama/cloud endpoint, arbitrary request-body JSON, custom template/system-prompt bypass, authentication token, or secret storage.
- No automatic parallel provider fan-out, public release, Git push, merge, branch cleanup, Developer ID signing, or notarization.
- No change from current-day scheduler semantics to previous-day semantics.

## Capabilities

### Modified Capabilities

- `dev-diary-macos-app`: new local-provider controls, live scheduler lease timing, honest runtime telemetry, and reversible missing-project reconciliation.

## Impact

- Existing custom agents remain byte-compatible because provider settings use a separate versioned Settings key; missing Ollama configuration receives safe defaults.
- SQLite receives additive project-presence columns and no destructive data rewrite.
- Missing projects are filtered only after the configured consecutive-miss threshold and recover automatically.
- The local packaged App version advances to `0.1.4`; remote release state is untouched.

## Risks

- A temporary disk or permission outage could look like deletion. Mitigation: only complete readable root observations count, direct-stat tracked paths, atomically claim each weekly period once, require two weekly misses, retain data, and auto-restore.
- A user-entered endpoint could become an SSRF or data-exfiltration sink. Mitigation: exact origin validation, local/private host allowlist, no credentials/path/query/fragment/redirect, and browser-origin authorization before settings writes.
- Advanced inference options could exhaust resources. Mitigation: numeric bounds, explicit allowlist, finite timeout/output defaults, and no arbitrary JSON passthrough.
- Installing the App could fail mid-replacement. Mitigation: validate an isolated candidate, stop and confirm all owned writers, create and verify a SQLite-backup-API snapshot, preserve the old App, and restore App plus database snapshot before restarting the old Core when packaged smoke fails.

## Open Questions

None. The user approved `23:40`, configurable provider controls, the repair, and reversible soft cleanup in this task.

## Completion Evidence

- Strict OpenSpec validation, Author Preflight, O3 compatibility/failure-recovery/integration-authority/rollout review, and fresh closer.
- Level 4 test document plus focused and full Core/UI suites, typecheck, build, security probes, and diff review.
- Live Ollama `qwen3:8b` smoke through the configured DevDiary adapter with bounded thinking/output.
- Desktop browser evidence for advanced custom-provider controls and reconciliation status.
- Independent black-box QA against a safe local runtime.
- Candidate App/DMG verification, recoverable local installation, packaged Core health, persisted `23:40`, and no remote mutation.
