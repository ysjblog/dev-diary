# QA Black-Box Report

- Environment: local Core `http://127.0.0.1:4318` + Vite `http://127.0.0.1:5174`
- Revision / HEAD SHA: `6130715` plus uncommitted workspace-range-state changes
- Timestamp: 2026-06-29T05:19:32Z
- Target URL / public entry: `http://127.0.0.1:5174`
- Test depth: Level 3
- Subagent attempt: not spawned
- Subagents used: none
- Fallback reason: current tool policy forbids spawning subagents unless the user explicitly asks; main agent performed a separate black-box pass without inspecting implementation during the pass.
- Result: PASS

## Scenarios

- [PASS] API selected-project custom range.
  Steps: request `/api/projects/1?range=custom&start=2026-06-29&end=2026-06-29`.
  Expected result: response is `200`, includes `range_key=custom`, canonical dates, and only `2026-06-29` Token Detail / Sessions rows.
  Actual result: `200 custom 2026-06-29 2026-06-29`, one session, Token Detail rows all on `2026-06-29`.

- [PASS] API empty future range.
  Steps: request `/api/projects/1?range=custom&start=2030-01-01&end=2030-01-07`.
  Expected result: response is `200` with zero selected-range metric values and empty Token Detail / Sessions / diary candidates.
  Actual result: `range_token_total=0`, `sessions.length=0`, `token_detail.rows.length=0`, `diary.length=0`.

- [PASS] API invalid custom date.
  Steps: request `/api/projects/1?range=custom&start=2026/06/01&end=2026-06-10`.
  Expected result: response is `400 invalid_range`.
  Actual result: `400 invalid_range`.

- [PASS] Workspace write endpoint preserves selected range.
  Steps: post a safe test comment to `/api/projects/1/comments?range=custom&start=2026-06-29&end=2026-06-29`.
  Expected result: response is `201`, refreshed snapshot keeps the selected custom range and ranged diary candidates.
  Actual result: `201 custom 2026-06-29 2026-06-29`, diary candidates all on `2026-06-29`.

- [PASS] Dashboard and Workspace range states are independent.
  Steps: open Dashboard, select `近7天`, navigate to Workspace, select `近24小時`, then navigate back to Dashboard.
  Expected result: Dashboard still shows `近7天`; Workspace shows `近24小時` cards.
  Actual result: Dashboard cards/donut/trend labels stayed `近7天`; Workspace metric strip showed `近24小時 Token 14k` and `近24小時 Sessions 1筆`.

- [PASS] Workspace range drives Token Detail and Sessions.
  Steps: with Workspace `近24小時` selected, open Token Detail and Sessions tabs.
  Expected result: Token Detail and Sessions match the same `2026-06-29` selected range.
  Actual result: Token Detail showed one `2026-06-29` row totaling `14,122`; Sessions showed `Session #279` on `06/29`.

- [PASS] Desktop and mobile RWD check.
  Steps: capture desktop viewport `1440x1000` and mobile viewport `390x844`.
  Expected result: range selector, metric strip, tabs, and session/token rows are visible without incoherent overlap.
  Actual result: desktop and mobile snapshots rendered the Workspace selector and ranged metric cards without visible overlap.

## Evidence

- Screenshots:
  - `/tmp/codex-ui-shot-df89aa9b86f2.png`
  - `/tmp/codex-ui-mobile-df89aa9b86f2.png`
- Commands / artifacts:
  - API smoke command output recorded in the session.
  - Playwright snapshots recorded under `.playwright-cli/`.
- Console errors: none (`Errors: 0`).
- Network/API errors: none for exercised happy paths; expected invalid-date probe returned `400 invalid_range`.

## Findings

- Severity: none.
- Reproduction steps: not applicable.
- Expected: not applicable.
- Actual: not applicable.

## Residual Risk

- The UI still has prototype Scan Now behavior; this is outside the range-state slice and remains a future task.
- No dedicated frontend unit test harness exists yet, so UI confidence comes from browser smoke and API-level tests.
