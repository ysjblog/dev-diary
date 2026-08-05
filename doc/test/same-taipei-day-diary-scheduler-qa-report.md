# QA Black-Box Report

- Environment: macOS local repository, SQLite `:memory:`, deterministic generators, ephemeral loopback HTTP
- Revision / HEAD SHA: `2bfab2f77f3521343ca10dcecdd315d9554d4b79` plus current candidate worktree
- Timestamp: 2026-08-05 Asia/Taipei
- Target URL / public entry: local Core runtime and public Core API
- Test depth: Level 3, Runtime smoke REQUIRED, Black-box QA REQUIRED
- Owner / QA Worker identity: `/root` / `/root/diary_blackbox_qa`
- Independence method: different read-only no-fork agent; no diff inspection and no user database access
- Bounded lens used: scheduler date/eligibility/idempotency and shared Taipei date boundary
- Result: PASS

## Scenarios

- [PASS] At 01:00 Taipei, scheduler targeted the current Taipei date and included a 00:30 session.
- [PASS] Only target-date session projects received persisted diary rows; prior-day-only and idle-labelled projects were not excluded or included by the five-day label.
- [PASS] A later ordinary same-day tick skipped after durable success.
- [PASS] A legacy same-date success without the current semantics marker transitioned once, then skipped; a valid lease remained protected.
- [PASS] Workspace, Dashboard and daily export assigned `15:59:59Z` to the current Taipei day and `16:00:00Z` to the next Taipei day.
- [PASS] Loopback scheduler, status, Workspace, Dashboard and export endpoints returned successful responses with expected persisted results.
- [PASS] Fresh finding rerun proved an only-session-at-`16:00:00Z` case reports zero current-day/weekly/monthly tokens for the prior Taipei date and 300 tokens for the next date.

## Evidence

- Screenshots: not required; no presentation/layout change in this Change.
- Commands / artifacts: read-only `tsx` runtime harnesses with SQLite `:memory:` and deterministic generators; independent exact-value assertions; Owner full Core/UI suites and runtime smoke are recorded in closeout evidence.
- Console errors: none in the black-box Core/API runs.
- Network/API errors: none; exercised loopback endpoints returned HTTP 200.

## Findings

- Initial QA found a medium-severity Workspace metric inconsistency: a historical `token_today` used only a lower date bound and included next-day tokens.
- Owner added an upper Taipei-date bound plus a boundary regression test.
- Fresh independent rerun observed: Taipei 2026-08-05 `token_today=0`, `token_week=0`, `token_month=0`, range `0/0`; Taipei 2026-08-06 `token_today=300`, range `1/300`.
- Final open findings: none.

## Residual Risk

- Real AI providers, the user database and installed-app visual interaction were intentionally excluded. Deterministic provider paths and temporary data cover the changed date/scheduler contract; provider availability remains governed by existing fallback behavior.
