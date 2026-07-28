# Implementation Tasks: Fix scan status and schedule Daily diary generation

## 中文摘要

先用測試鎖定掃描 operation 的回收與並行安全，再改 Core state/route；每日排程先測試三種輸出、確認內容保護與重跑規則，再接入既有 date-scoped writer。UI 與 runtime 證據留給後續 Execute、Verify-QA；本清單不表示已實作或已通過。

## Requirement Traceability

| Requirement | Design decision | Implementation task | Verification |
|---|---|---|---|
| Stable scan identity and historical cache | D1, D2 | 1.2, 2.1, 2.2 | settings/route/background tests; later Core/API and supported desktop Footer evidence; mobile validation is not applicable |
| Date-scoped diary and AI draft recovery | D3 | 1.3, 2.3 | scheduler/project-write tests; later scheduler API smoke |
| Scheduler and runtime lifecycle are fail-safe | D4 | 1.3, 2.4, 3.1 | scheduler/background tests, typecheck/build, independent Verify-QA |

## 1. Spec and Test Preparation

- [x] 1.1 Confirm fresh author preflight, converged Spec Review, and user acceptance before executable changes.
- [x] 1.2 Add failing/contract tests for normalized operation fields, 30-second heartbeat renewal and ten-minute deadline extension, legacy/malformed/dead-owner recovery, live concurrency, newest completion ordering, and finish-on-error for global/project/background owners.
- [x] 1.3 Add schema/migration and reader tests for `project_daily_diaries` table-first project/Markdown-export reads with legacy fallback and redacted-backup inclusion, plus scheduler Daily diary prompt selection, shared Taipei default-date pinning, confirmation during provider await, fallback, SQLite lease races, ordinary same-date skip versus forced rerun, two-stage ordering, final-transaction rollback plus durable-failure-write failure, named output counters, and one-row-per-date idempotency.

## 2. Implementation

- [x] 2.1 Extend `BackgroundScanOperation` normalization/persistence in `core/src/services/settings.ts` with exact `owner_instance_id`, `owner_pid`, 30-second `heartbeat_at` renewal, ten-minute renewed `deadline_at`, `last_recovered_operation` fields, legacy/malformed recovery, and reconciled active-state access.
- [x] 2.2 Update `core/src/server.ts` and `core/src/services/backgroundRunner.ts` so every recorded start receives one finally-safe finish attempt, concurrent operations remain isolated, and responses use reconciled state.
- [x] 2.3 Add the SQLite migration, `project_daily_diaries` reader/writer boundary, table-first Daily Markdown export/legacy fallback and redacted-backup inclusion, and transaction-time confirmed guard; update `core/src/services/dailyScheduler.ts` so eligible runs use a distinct `daily_diary_entry` generator, preserve confirmed entries, and keep Project summary separate.
- [x] 2.4 Add `daily_scheduler_runs` atomic lease and shared Asia/Taipei default-date contract; preserve daily Kanban gating only after all project outputs, then add named compatible result fields and atomic highlight/success-state reporting with separate durable-failure fallback for rollback, ordinary ticks, and forced reruns.

## 3. Verification and Documentation

- [x] 3.1 Run routed Core tests, Core typecheck, UI/API tests, build, and `git diff --check`; record fresh versus unavailable evidence.
- [x] 3.3 Create an independent Verify-QA task after Execute is green; reconcile Feature Spec, `docs/specs/MASTER.md`, and archive readiness only later.

## 4. Authorization-gated follow-up

- [ ] 4.1 Archive this active Change only after the user explicitly authorizes the archive action; do not archive, commit, merge, push, or deploy as part of implementation/QA completion.

## Verification

Run `core` targeted tests for settings, scheduler, background runner, project writes, and exports; then Core typecheck, root UI/API tests, root build, and `git diff --check`. Before Spec Review run strict OpenSpec validation and fresh Author Preflight. Later runtime acceptance requires local Core API smoke and fresh desktop browser evidence for stale recovery, scan cleanup, scheduler Daily diary generation, shared Taipei default-date reads, and confirmed-diary preservation. Mobile viewport/RWD validation is not applicable because the product contract is desktop-only and the user explicitly excluded phone-interface verification.

## Open Questions

None.
