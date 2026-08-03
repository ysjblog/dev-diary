# QA Black-Box Report

- Environment: repository-local Core runtime, Node/TSX, loopback HTTP on an ephemeral port, SQLite `:memory:`, seeded deterministic fixtures, injected deterministic diary generator; no installed-app database and no real AI provider.
- Revision / HEAD SHA: `af1a21311eea49787d9beddbaa6d36bb29c22720`
- Tested working-tree implementation digest: SHA-256 `4cae4aea42abb523d09cb472f862f22b345eac70033fe28001744861776c7054` over the binary Git diff for the three changed Core service files (`dailyScheduler`, `diaryAgent`, `taipeiDate`).
- Timestamp: `2026-08-03T17:01:16Z` (`2026-08-04T01:01:16+08:00`)
- Target URL / public entry: ephemeral `http://127.0.0.1:<random-port>/api/scheduler/daily/*`; `DailySchedulerRuntime.tick`; `buildProjectDiaryPrompt`.
- Test depth: Level 3 required independent black-box QA.
- Owner / QA Worker identity: Owner `/root`; QA Worker `/root/diary_black_box_qa`.
- Independence method: separate no-fork read-only QA Worker; only the present report was written. Assertions were authored and executed independently against public Core entry points, not inferred from Owner conclusions.
- Bounded lens used: automatic target-date behavior, externally observable returned/persisted dates, prompt boundary safety and evidence completeness, same-date path parity, idempotence, and confirmed-content preservation.
- Result: PASS

## Scenarios

- [PASS] Automatic 01:00 scheduler uses the previous completed Taipei day. With `now=2026-07-01T01:00:00+08:00`, the first ordinary tick returned `success` and `date=2026-06-30`. Exactly one successful `daily_scheduler_runs` row existed for `2026-06-30`; all three seeded projects had diary rows on that date; `daily_logs` also contained `2026-06-30`.
- [PASS] Same target-date ordinary execution is idempotent. A second tick at `2026-07-01T02:00:00+08:00` returned `skipped` with the observable `already ran` message, and the scheduler run count remained one.
- [PASS] Year rollover. With `now=2027-01-01T01:00:00+08:00`, the automatic tick returned and persisted `2026-12-31` as a successful run.
- [PASS] Loopback API-style workflow. `GET /api/scheduler/daily/preflight` returned HTTP 200 and `overall_status=ok`; `POST /api/scheduler/daily/run` returned HTTP 200, `status=success`, and `date=2026-06-30`. The returned date matched the persisted scheduler row, three project diary rows, and the daily-log date. The injected deterministic generator was used; no provider was called.
- [PASS] Maximum valid override and prompt boundary. An exactly 5,000-character override retained its final marker. The generated prompt retained `SAFETY_CONSTRAINTS`, `STRUCTURED_DATA`, `session_evidence`, `recent_commits`, useful session summary text, useful commit text, and the explicit untrusted-evidence preamble.
- [PASS] Sensitive and instruction-like evidence handling. Injected absolute-path, secret-like, source-reference, author, and multiline instruction-like fixture values did not surface as raw path/secret/source-reference values. The useful text remained, while the newline-delimited instruction-like text appeared encoded as data rather than as a raw new prompt line.
- [PASS] Manual/scheduler same-date parity. Building prompts from equivalent same-date snapshots, with the scheduler copy omitting prior diary rows, produced byte-for-byte identical prompt output.
- [PASS] Confirmed-diary forced rerun protection. After storing a confirmed diary for project 1 on `2026-06-30`, a second `POST /api/scheduler/daily/run` returned HTTP 200 and `success`, reported one preserved diary, and left both the confirmed status and fixture markdown unchanged.

## Evidence

- Screenshots: not applicable; no presentation code or UI behavior is in scope.
- Commands / artifacts:
  - `~/.codex/scripts/bootstrap/codex-project-bootstrap.sh`
  - `cd core && ./node_modules/.bin/tsx --eval '<QA-A inline assertions>'` — fresh in-memory loopback API workflow, 5,000-character prompt checks, manual/scheduler parity, and confirmed forced-rerun protection. Output counts: HTTP success responses `2`; seeded projects and persisted diary rows `3`; preserved confirmed diaries `1`; prompt assertions `11/11` passed; parity `1/1` passed.
  - `cd core && ./node_modules/.bin/tsx --eval '<QA-B inline assertions>'` — fresh automatic ordinary tick, duplicate-tick idempotence, persisted date checks, and year rollover. Output counts: automatic success `2/2`; duplicate ordinary tick skipped `1/1`; run-row date checks `2/2`; diary/date-log checks `2/2`.
  - Both inline programs used only exported repository APIs, `:memory:` databases, deterministic seeded fixtures, and Node strict assertions. They emitted only bounded boolean/count/date JSON; no raw log, prompt, credential, or source-reference content was printed.
  - Revision commands: `git rev-parse HEAD`; `git diff --no-ext-diff --binary -- core/src/services/dailyScheduler.ts core/src/services/diaryAgent.ts core/src/services/taipeiDate.ts | shasum -a 256`; `git status --short`.
- Console errors: none.
- Network/API errors: none. Traffic remained on loopback and used an ephemeral port.

## Findings

- Severity: none.
- Reproduction steps: all bounded acceptance scenarios above passed; no failing reproduction exists.
- Expected: the scheduler targets the previous Taipei calendar day, prompt evidence remains complete and safely bounded, equivalent manual/scheduler inputs do not diverge, and confirmed diary content survives forced reruns.
- Actual: matched expected behavior in every executed scenario.

## Residual Risk

- Evidence is intentionally limited to a repository-local in-memory runtime with deterministic fixtures. It does not prove installed/packaged app scheduling, sleep/wake behavior, a real user database, or real AI-provider behavior.
- The exact implementation under test includes uncommitted Owner changes. The HEAD SHA alone is insufficient to reproduce it, so the relevant working-tree diff digest is recorded above; any subsequent edit invalidates this receipt and requires a fresh QA run.
- No UI check was performed because the acceptance document explicitly excludes presentation changes.
