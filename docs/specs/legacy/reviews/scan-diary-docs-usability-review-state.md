# Scan, Diary, And Docs Usability — Review State

## SPEC REVIEW ROUTE

- Level: 3
- Reason: The delta changes local CLI execution, persistent state shared by manual/background scans, scheduler timing, document filtering/sorting, and visible UI workflow.
- Spec: `docs/specs/deltas/scan-diary-docs-usability-delta.md`
- Touched surface: `core/src/server.ts`, settings mutation/state, background runner, diary agent adapters, project docs contract, `src/App.jsx`, CSS and API tests.
- Load-bearing claims: manual routes currently do not update `background_scan`; runner sleeps a fixed returned interval; Codex has an executable resolver but no diary adapter; docs are name-sorted; sidebar spinner only follows local manual state.
- Plan: Fact inventory -> independent all-five-lens reviewer -> author fix pass if required -> fresh all-five-lens closer.
- Subagent attempt: requested
- Subagents required: yes
- Subagents used: pending `sol`
- Fallback reason: none
- Budget mode: bounded
- Required lenses this round: data-and-facts, naming-and-types, blast-radius, execution-order, logic-and-design
- Deferred lenses: none
- Why deferred: Level 3 hard floor requires all five.
- Escalation trigger: any high finding, missing reader/writer, or inconclusive required lens.
- Round trust policy: required lenses without structured findings are inconclusive, never clean.

## FACT INVENTORY

verifiedFacts:
- claim: `background_scan` is persisted via a narrow `mutateSettings` writer.
  status: confirmed
  evidence: `core/src/services/settings.ts:1051`
- claim: only `runBackgroundCycle` currently writes this state.
  status: confirmed
  evidence: `core/src/services/backgroundRunner.ts:89-100`; no writer in manual routes.
- claim: background executable sleeps the fixed `result.next_interval_ms` after each cycle.
  status: confirmed
  evidence: `core/src/backgroundRunner.ts:108-114`
- claim: global/project manual routes call `runManualScan` but do not record the scan state.
  status: confirmed
  evidence: `core/src/server.ts:457-506`
- claim: Codex executable detection/source resolver exists but settings marks it Diary unsupported and configured diary factories omit it.
  status: confirmed
  evidence: `core/src/services/agentDetection.ts:277-281`; `core/src/services/settings.ts:764-773`; `core/src/services/diaryAgent.ts:447-487`
- claim: Docs are Core-persisted and currently sorted only by name.
  status: confirmed
  evidence: `core/src/services/projects.ts:379-392`
- claim: sidebar refresh only spins for local `isScanRunning`; Settings polling is 60 seconds and merges only read-only background state.
  status: confirmed
  evidence: `src/App.jsx:623-646`; `src/App.jsx:1666-1670`
- claim: top-level agent card redundantly renders Version/Binary path and executable resolved path has ellipsis CSS outside wrap mode.
  status: confirmed
  evidence: `src/App.jsx:2801-2824`; `src/index.css:2831-2857`

alreadyWrongClaims:
- specClaim: manual scans are a basis for the next background interval.
  reality: they return scan results but never update persisted background scan state; runner sleeps a previously computed fixed interval.
  evidence: `core/src/server.ts:457-506`; `core/src/backgroundRunner.ts:108-114`

summary: Root causes are a split state/timer contract, a deliberate Codex unsupported branch, name-only document query, and UI state derived solely from manual actions.

## Rounds

- Round 1: pending independent `sol` review.

## FIX REPORT — author pass after reviewer findings

- concernTags: `scan-state-writer`, `operation-identity`, `terminal-monotonicity`, `due-time-authority`
  - resolution: Delta now names `recordScanOperation` as the sole writer, requires UUID/scope/project identity, separates concurrent `running_operations` from last terminal operation, provides monotonic completion/tie-break rules, and makes `next_due_at` the completion-time authority.
  - verifyString: `rg -n "recordScanOperation|running_operations|completion monotonicity|next_due_at = max" docs/specs/deltas/scan-diary-docs-usability-delta.md`
- concernTags: `runner-wait-race`, `manual-background-interleaving`, `sqlite-busy`
  - resolution: Delta specifies a maximum 30-second persisted-state re-read while waiting, rejects prior fixed interval authority, and requires manual/background interleave plus SQLite busy retry/exhaustion tests.
  - verifyString: `rg -n "min\\(30_000ms|manual completion|SQLite busy regression test|database_busy" docs/specs/deltas/scan-diary-docs-usability-delta.md`
- concernTags: `codex-exec-safety`, `argv-contract`, `temporary-cwd`, `capability-migration`
  - resolution: Delta now fixes the Codex `exec` argv, `shell:false`, read-only/ephemeral ceiling, user-config/rules policy, env allowlist, temp cwd lifecycle, fallback secrecy, and supported/default migration contract with fixture coverage.
  - verifyString: `rg -n "'--sandbox', 'read-only'|temporaryCwd|--ignore-user-config|default_diary_agent: 'codex-cli'" docs/specs/deltas/scan-diary-docs-usability-delta.md`
- concernTags: `docs-timestamp-semantics`, `logical-path-normalization`, `docs-sort-test`
  - resolution: Delta selects source `stat.mtime` rather than ingest time, defines POSIX logical-path normalization/rejection, and names fixture cases for ordering, separators, traversal and grouping.
  - verifyString: `rg -n "stat.mtime.toISOString|POSIX logical path|Windows-style separator|updated_at DESC" docs/specs/deltas/scan-diary-docs-usability-delta.md`
- concernTags: `polling-state-machine`, `dirty-state-protection`, `rwd`
  - resolution: Delta now defines initial fetch, 5-second running and 60-second idle cadence, immediate response merge, persisted spinner source, dirty-state invariants, and desktop/mobile checks.
  - verifyString: `rg -n "5 秒 cadence|60 秒|docs query|desktop/mobile RWD" docs/specs/deltas/scan-diary-docs-usability-delta.md`

Status: findings addressed in the Delta draft; this is not a clean review. A fresh independent all-five-lens review and later implementation/verification remain required.

## Implementation and verification closeout

- Runtime/API evidence: manual `POST /api/scan` updated `last_completed_at` and `next_due_at` on loopback Core; browser observed the sidebar timestamp changing and scan-running state clearing.
- Automated evidence: Core tests/typecheck and UI tests/build passed after the final state/adapter/docs changes.
- Independent QA: `luna` black-box verified Codex selection/path detail, scan UI state, Docs grouping/search, folder icon, and clean browser console; one duplicate card-header version finding was fixed and re-verified.
- Final implementation review: `sol` identified startup-due, missing-project, resolver, and busy-response gaps; fixes were applied and targeted regression/typecheck rerun.
