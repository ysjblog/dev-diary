# QA Black-Box Report

- Environment: local Core `http://127.0.0.1:4328`
- Revision / HEAD SHA: `90471a7` + working tree changes
- Timestamp: 2026-06-30 08:43 Asia/Taipei
- Target URL / public entry: `POST /api/projects/1/summary/regenerate`
- Test depth: Level 3, Runtime smoke REQUIRED, Black-box QA REQUIRED
- Subagent attempt: skipped
- Subagents used: none
- Fallback reason: subagent tool policy disallows spawning unless the user explicitly asks for subagents; main agent performed a separate black-box API/browser pass.
- Result: PASS

## Scenarios

- [PASS] Antigravity CLI availability smoke. Steps: run `agy --model 'Gemini 3.5 Flash (Medium)' --print-timeout 20s --print ...` from the temp runner cwd. Expected: one-shot print mode responds without login prompt. Actual: returned a short Traditional Chinese smoke response in about 4.5 seconds.
- [PASS] Node default `execFile` regression. Steps: run `core/test/diaryAgent.test.ts` with a fake CLI that waits for stdin EOF before printing. Expected: default exec closes stdin and returns Markdown before timeout. Actual: test passed in the default exec hot path.
- [PASS] Direct Core diary agent smoke. Steps: call `createAntigravityProjectDiaryAgent({ execTimeoutMs: 30000, printTimeout: '20s' })` against seeded project detail. Expected: `agent_id=antigravity-cli`, Markdown draft, no fallback reason. Actual: returned Markdown in about 8.8 seconds with no fallback reason.
- [PASS] Core summary regenerate API uses real Antigravity output. Steps: start local Core on port 4328 with in-memory DB, set `default_diary_agent=antigravity-cli`, call `POST /api/projects/1/summary/regenerate?range=all`. Expected: HTTP 200 with real Markdown draft, no `Fallback reason`, no raw command leakage. Actual: HTTP 200 in about 6.5 seconds, AI draft written, no `Fallback reason`, no `Command failed:`.
- [PASS] Dashboard chart regression scope. Steps: no UI files changed in this fix; rely on previous same-slice RWD screenshots. Expected: no new UI verification needed for Core-only subprocess change. Actual: not rerun.

## Evidence

- Screenshots:
  - Not applicable for this Core-only fix; no UI files changed.
- Commands / artifacts:
  - direct `agy --print` smoke
  - direct Core diary agent smoke via `npx tsx`
  - local Core API smoke on `http://127.0.0.1:4328`
  - `cd core && npm test`
  - `cd core && npm run typecheck`
  - `npm test`
  - `npm run build`
  - `git diff --check`
- Console errors: not applicable; browser was not part of this Core-only fix.
- Network/API errors: none for Core API smoke.

## Findings

- Severity: none.
- Reproduction steps: none remaining for this fix.
- Expected: Node `execFile` Antigravity print mode returns real Markdown before timeout.
- Actual: real Core agent and API smoke both returned Antigravity Markdown before timeout.

## Residual Risk

- The fix proves Workspace summary regenerate can get real Antigravity output through Node `execFile` in the current local runtime.
- Scheduler-grade reliability is still a future slice because the global daily scheduler has not been implemented yet.
