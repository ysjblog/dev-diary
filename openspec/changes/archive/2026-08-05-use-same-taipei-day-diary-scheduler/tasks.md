---
openspec_level: o1
template_version: owner-workflow/v1
change: use-same-taipei-day-diary-scheduler
reasons: durable_shared_contract, multiple_journeys_roles
---
# Implementation Tasks: Use same Taipei day for diary scheduler

## 中文摘要

先以跨午夜與排程狀態測試重現 UTC 分桶、前一日 target、inactive project 寫入與舊 success 阻擋，再實作共用台北日期契約並完成安全 runtime/QA。

## Implementation and Verification Tasks

- [x] 1.1 Add Level 3 cases to `doc/test/` for same-day point-in-time execution, Taipei day/hour boundaries, target-date eligibility, UI fallback provenance, upgrade semantics and confirmed preservation.
- [x] 1.2 Add failing Core tests across scheduler, projects, Dashboard and exports before production edits.
- [x] 2.1 Add canonical Taipei timestamp/day/hour helpers and replace UTC substring date bucketing in all affected readers.
- [x] 2.2 Make automatic and forced scheduler runs target the current Taipei date and limit scheduled AI work to projects with target-date sessions.
- [x] 2.3 Persist a scheduler semantics marker only after success and allow one safe transition rerun without bypassing leases or confirmed-content protection.
- [x] 3.1 Run focused and full Core tests, root tests/build/typecheck, OpenSpec validation, security/diff review.
- [x] 3.2 Run Owner safe-runtime smoke for same-day API results, zero/inactive projects, transition rerun and persisted dates.
- [x] 3.3 Run required independent black-box QA and consume findings.
- [x] 4.1 Sync current Feature Spec and `MASTER.md`, archive the Change, commit, and rebuild/verify App plus DMG.

## Requirement Traceability

| Requirement | Design decision | Tasks | Verification |
|---|---|---|---|
| Date-scoped diary and AI draft recovery | exact target-date session eligibility | 1.1, 1.2, 2.2 | scheduler/project tests, runtime QA |
| Dashboard reflects persisted Core data | canonical Taipei day/hour expressions | 1.1, 1.2, 2.1 | Dashboard/project/export tests |
| Scheduler and runtime lifecycle are fail-safe | same-day target plus success-bound semantics marker | 1.1, 1.2, 2.2, 2.3 | transition/idempotency/confirmed tests |

## Verification

- `cd core && pnpm exec vitest run test/dailyScheduler.test.ts test/projects.test.ts test/dashboard.test.ts test/exports.test.ts`
- `cd core && pnpm test && pnpm typecheck`
- `npm test && npm run build`
- `openspec validate use-same-taipei-day-diary-scheduler --strict --no-interactive`

## Open Questions

- None.
