---
openspec_level: o1
template_version: owner-workflow/v1
change: fix-automatic-daily-diary-input
reasons: durable_shared_contract,multiple_journeys_roles
---
# Implementation Tasks: Fix automatic Daily diary input

## 中文摘要

先用測試重現「自動排程日期過早」與「snapshot 沒有足夠內容」，再修正 Core，最後以安全 runtime 驗證。

## Implementation and Verification Tasks

- [x] 1.1 Update `doc/test/` with the Level 3 route, previous-day scheduler cases, manual/scheduler prompt parity, and privacy/prompt-injection cases.
- [x] 1.2 Add failing tests in `core/test/dailyScheduler.test.ts` and `core/test/diaryAgent.test.ts`; record the expected failures before production edits.
- [x] 2.1 Implement previous-Taipei-day scheduler target resolution while preserving lease/idempotency and explicit manual date behavior.
- [x] 2.2 Enrich the shared diary prompt with bounded redacted session and date-scoped commit evidence plus untrusted-data constraints.
- [x] 2.3 Run focused tests and update matching checkboxes only after they pass.
- [x] 3.1 Run Core full tests/typecheck, root tests/build, security scans, and diff review.
- [x] 3.2 Run an Owner safe-runtime smoke proving the scheduler result date and generated prompt evidence without calling a real provider or touching the user database.
- [x] 3.3 Run required independent black-box QA against the safe runtime and consume any findings.
- [x] 4.1 Sync the accepted behavior into the current Feature Spec and `MASTER.md`, validate, archive the Change, and reconcile current truth.

## Requirement Traceability

| Requirement | Design decision | Implementation task | Verification |
|---|---|---|---|
| Date-scoped diary and AI draft recovery | Shared bounded/redacted evidence builder | 1.1, 1.2, 2.2 | diary-agent/project-write tests, safe runtime smoke, independent QA |
| Scheduler and runtime lifecycle are fail-safe | Previous Taipei day target | 1.1, 1.2, 2.1 | scheduler tests, safe runtime smoke, independent QA |

## Verification

- `cd core && pnpm exec vitest run test/dailyScheduler.test.ts test/diaryAgent.test.ts test/projectWrites.test.ts`
- `cd core && pnpm test && pnpm typecheck`
- `npm test && npm run build`
- `openspec validate fix-automatic-daily-diary-input --strict --no-interactive`

## Open Questions

- None.
