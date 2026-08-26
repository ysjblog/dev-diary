---
openspec_level: o3
template_version: owner-workflow/v1
change: harden-daily-ai-local-providers-and-project-reconciliation
reasons: external_write
---
# Implementation Tasks: harden-daily-ai-local-providers-and-project-reconciliation

## 中文摘要

先讓規格、Level 4 測試與 O3 review 收斂，再依序修 Core 契約、UI、實機 provider、包裝與正式安裝。所有刪除型專案清理都由可回復的 missing 狀態取代。

## Requirement Traceability

- `Configurable local Ollama generation is bounded and explicit` → 2.1, 2.2, 2.5, 3.1, 3.4, 4.1, 4.2, 5.1.
- `Scheduler target date and lease time are independent and observable` → 2.1, 2.3, 3.2, 4.1, 4.2, 5.1.
- `New local-provider UI rejects an old Core runtime` → 2.1, 2.2, 2.5, 3.2, 3.4, 4.1, 4.2, 5.1.
- `Missing-project reconciliation is reversible and root-aware` → 2.1, 2.4, 2.5, 3.3, 3.4, 4.1, 4.2, 5.1.
- Safe local rollout → 6.x.

## Tasks

- [x] 1.1 Complete O3 Proposal/Delta/Design/Tasks, strict validation and Author Preflight.
- [x] 1.2 Run the compatibility, failure-recovery, integration-authority and rollout lenses; apply one consolidated Owner fix and obtain a fresh closer.
- [x] 2.1 Create `doc/test/daily-ai-local-provider-project-reconciliation.md` with Level 4 route, adversarial endpoint/option matrix, advancing lease clock, root-outage/two-miss/restore cases, API/UI/runtime and rollback acceptance.
- [x] 2.2 Add failing Core tests for Ollama normalization/request execution, invalid/public/redirecting endpoints, every documented bound, honest fallback, separate versioned persistence, API contract/capability mismatch, and a real legacy-reader rollback fixture.
- [x] 2.3 Add failing scheduler/project-write/Kanban tests proving target date remains fixed while lease renewal/completion use an advancing clock, abort/fence context reaches fetch/CLI prompt runners and every provider-to-write intermediary, lease loss blocks all later effects, a second owner can safely reclaim, and success/fallback/failed/skipped logs satisfy every typed per-output invariant including malformed/timeout/zero-card Kanban.
- [x] 2.4 Add failing discovery/schema/scan tests for complete/partial/unreadable root observations, direct-stat marker/depth independence, an atomic one-observation-per-period claim, two consecutive misses, no cascaded history deletion, scan/AI exclusion and automatic restore.
- [x] 2.5 Add failing API/UI tests for persisted advanced controls, schedule `23:40`, validation errors, reconciliation capability handshake, desktop rendering and safe warning text.
- [x] 3.1 Implement separate versioned typed Ollama settings/defaults/legacy normalization and source-to-sink request allowlist with `redirect: 'error'`, abort propagation and sanitized failures.
- [x] 3.2 Implement target/lease clock separation, lease-generation fencing/abort checkpoints through `projectWrites`/Kanban/global-summary boundaries, typed per-output scheduler/background telemetry, and Core/UI API contract version 6 capabilities.
- [x] 3.3 Implement additive project presence/reconciliation-run migration, atomic weekly ownership, complete-root/direct-path observation, active-path filters and automatic restoration.
- [x] 3.4 Implement Settings/Agents UI controls and concise local/private endpoint disclosure.
- [x] 4.1 Run focused Core/UI tests, Core typecheck, root tests/build, migration compatibility and security probes; fix only proven failures under the two-attempt policy.
- [x] 4.2 Run Owner localhost smoke with real `qwen3:8b`, bounded thinking/output, `23:40` settings round-trip, reconciliation fixtures and supported desktop viewport capture.
- [x] 5.1 Run different-agent black-box QA and fresh O3 security/recovery verification; consume findings and rerun invalidated evidence.
- [x] 6.1 Archive the Change without `--skip-specs`, reconcile current Feature Spec and `MASTER.md`, run all-current strict/preflight checks, stage the exact verified allowlist and create a conventional commit.
- [ ] 6.2 Bump/build the local `0.1.4` candidate from that clean commit, package App/DMG, verify isolated health, and create a candidate identity receipt binding revision, clean state, package-input/version/App/DMG digests.
- [ ] 6.3 Stop and confirm all owned writers, create a SQLite Backup API snapshot plus integrity/digest receipt, preserve the old App, replace `/Applications/DevDiary.app`, restart only the owned background service, set scheduler `23:40` through Core, and verify packaged health/provider/settings; on failure stop new Core, restore App and DB snapshot in that order, then verify the old Core. Any identity drift invalidates the candidate and requires rebuild before replacement.

## Verification

- `openspec validate harden-daily-ai-local-providers-and-project-reconciliation --strict --no-interactive`
- `python3 ~/.codex/skills/openspec/scripts/spec_author_preflight.py --project-root . --change harden-daily-ai-local-providers-and-project-reconciliation --write-receipt`
- `pnpm --dir core test -- <focused files>` then `pnpm --dir core test` and `pnpm --dir core typecheck`
- `pnpm test`, `pnpm build`, privacy/security scans and `git diff --check`
- localhost API/UI smoke, real Ollama adapter smoke, independent black-box QA, `pnpm package:mac`, mounted artifact verification and packaged Core health.

## Open Questions

None.
