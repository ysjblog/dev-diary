# Workspace Range State Test Plan

## Test Depth Route

- Level: 3
- Reason: Dashboard / Workspace range state split changes user-visible UI state and the Core API contract for selected-project range snapshots.
- Required verification: Core unit/API tests, UI build, runtime smoke, desktop/mobile RWD checks, black-box QA report.
- Allowed skips: Dedicated React component tests are skipped because this prototype has no frontend test harness; browser smoke covers the rendered workflow.

## Bug Pattern Coverage

- [x] Boundary values / empty range: empty future custom range must return zero/empty selected-project rows instead of falling back to all-time.
- [x] Contract generated and execution applied: `range/start/end` must be reflected in metric strip, Token Detail, Sessions, and diary candidates.
- [x] Operation order invariants: Core validates and canonicalizes the range before issuing persisted queries.
- [x] Production-like dirty data: reversed custom dates must canonicalize to the same snapshot as forward dates.
- [x] Multi-condition combinations: Workspace range must combine with diary exact-date and keyword filters in the UI.
- [x] State/history/retry/refresh behavior: Dashboard range state and Workspace range state must not mutate each other.
- [x] Externally observable result, not only implementation detail: API and browser smoke must show ranged project detail changes.

## User Journey

As a DevDiary user, I want Dashboard and Workspace to remember separate time ranges, so that changing project-level analysis does not unexpectedly rewrite global Dashboard analytics.

As a DevDiary user, I want the Workspace selected-project range to drive metric strip, Token Detail, Sessions, and diary blocks together, so that all project detail sections describe the same time window.

## Automated Checks

- `cd core && npm test`
- `cd core && npm run typecheck`
- `npm run build`

## Runtime Smoke

1. Start Core with a non-default port.
2. Start Vite with `DEVDIARY_CORE_URL` pointing at that Core.
3. Open Dashboard, switch Dashboard range to `近7天`.
4. Open Projects Workspace, switch Workspace range to `近24小時` or a custom date.
5. Confirm Dashboard selector still shows `近7天`.
6. Confirm Workspace metric strip, Token Detail rows, Sessions, and diary blocks reflect only the selected Workspace range.
7. Confirm invalid custom range is surfaced as an API validation error, not replaced by mock data.

## Verification Results

- `cd core && npm test` — PASS, 52/52 tests.
- `cd core && npm run typecheck` — PASS.
- `npm run build` — PASS.
- API smoke — PASS: custom range, empty future range, invalid date, and range-preserving write response.
- Playwright desktop/mobile smoke — PASS: Dashboard `近7天` and Workspace `近24小時` remained independent; Token Detail and Sessions reflected the Workspace range.
- Black-box QA — PASS, see `doc/test/workspace-range-state-qa-report.md`.
