# Root-cause continuation evidence

## ROOT CAUSE DEBUGGING

- Symptom: O3 final closer rejected the Change after the consolidated author fix.
- Reproduction: `route_review_round.py review-state.json` returns `final_review_findings_require_root_cause`.
- Observed evidence: the pre-fix matrix digest was `31782573a4b3937d566662b614668e56f90a8f46c388df9e0a46af055fd49e5d`; the initial reviewer returned eight structured high findings; the post-fix final reviewer returned five new cross-file findings.
- Suspected cause: the design named outcomes but did not inventory every provider-to-write intermediary, API compatibility consumer, counter unit or package identity input.
- Root cause: the first fix compressed review evidence to ids and repaired prose at the scheduler boundary without tracing the complete downstream execution/compatibility/rollout path.
- Fix boundary: specification/review authority only—expand exact intermediary interfaces, version handshake, telemetry equations, candidate identity and before/after evidence. No executable implementation occurs until fresh continuation verification passes.
- Verification: strict OpenSpec, fresh Author Preflight, expanded Contract Matrix, exact `verifyString` landing checks, then one bounded fresh reviewer permitted by root-cause continuation policy.
- Residual risk: executable behavior, runtime smoke, packaging and installation remain unproven until Level 4 TDD and verification complete.

## Preserved initial review evidence

Initial reviewer: `/root/spec_initial_review`

Initial review revision: `3dccf669dc4b952818a89378cf1e4754d708248d`

Pre-fix Contract Matrix digest: `31782573a4b3937d566662b614668e56f90a8f46c388df9e0a46af055fd49e5d`

### COMPAT-001

- Severity/lens: high / compatibility
- Original location: `design.md:100-105`; Delta `spec.md:79-84`
- Runtime evidence: `core/src/services/settings.ts:643-662` rejects unknown custom-agent fields; `core/src/services/settings.ts:1002-1013` normalizes persisted custom agents on every read.
- Impact: nesting provider fields in the legacy agent record makes rollback to 0.1.3 unable to load settings.
- Accepted fix: use separate `custom_agent_providers_v1` persistence and a real legacy-reader fixture.
- concernTags: `data-facts`, `field-type`, `design-contract`
- verifyString: `The legacy \`core.custom_agents\` shape stays unchanged.`

### RECOVERY-001

- Severity/lens: high / failure_recovery
- Original location: `design.md:78-84`; Delta `spec.md:40-52`
- Runtime evidence: `dailyScheduler.ts:313-316` only sets `leaseLost`; provider/database effects at `dailyScheduler.ts:346-385` precede the final ownership check.
- Impact: a stale owner can continue provider work and writes after a second owner reclaims.
- Accepted fix: run-scoped abort, generation fence, post-await and in-transaction assertions through every intermediary.
- concernTags: `execution-order`, `readers-writers`, `design-contract`
- verifyString: `immediately after the provider await, and again inside the SQLite transaction before the first statement`

### RECOVERY-002

- Severity/lens: high / failure_recovery
- Original location: `design.md:32-40,56-59,78-84`; Delta `spec.md:54-71`
- Runtime evidence: `projectDiscovery.ts:50-82` has nested boundaries, max depth and swallowed traversal errors; result has no per-root completeness.
- Impact: an existing project can be hidden because discovery did not see it.
- Accepted fix: separate discovery from direct tracked-path stat and require complete root traversal.
- concernTags: `data-facts`, `execution-order`, `design-contract`
- verifyString: `a due reconciliation directly stats each already-tracked path under a configured root`

### RECOVERY-003

- Severity/lens: high / failure_recovery
- Original location: `design.md:37-40,56-59,78-84`; Delta `spec.md:54-66`
- Runtime evidence: `scans.ts:490-496` calls discovery from every global scan and current scan operation state is observability, not a reconciliation mutex.
- Impact: two callers can count one weekly absence twice.
- Accepted fix: durable period owner plus `BEGIN IMMEDIATE` ownership/cadence recheck.
- concernTags: `execution-order`, `design-contract`
- verifyString: `only that winner mutates counters and completes the period`

### AUTH-001

- Severity/lens: high / integration_authority
- Original location: `design.md:52-55,86-91`; Delta `spec.md:21-33,73-77`
- Runtime evidence: `diaryAgent.ts:289-303` fetch uses default redirect-follow behavior.
- Impact: a local origin can redirect private prompt data to a public endpoint.
- Accepted fix: provider fetch uses `redirect: 'error'` and follows no redirect.
- concernTags: `execution-order`, `design-contract`
- verifyString: `Provider fetch MUST use \`redirect: 'error'\``

### RECOVERY-004

- Severity/lens: high / failure_recovery
- Original location: `proposal.md:15-26`; `design.md:66-75`; Delta `spec.md:40-52`
- Runtime evidence: scheduler only counted generic updates and dropped `DiaryDraftResult.agent_id/fallback_report` for several outputs.
- Impact: a run can say success while every provider output is fallback.
- Accepted fix: define exact project/run/card/invocation units and equations, and return the real draft outcome through intermediaries.
- concernTags: `field-type`, `readers-writers`, `design-contract`
- verifyString: `Each provider success requires a non-fallback \`agent_id\`, null \`fallback_report\`, a live post-await fence and a committed write.`

### AUTH-002

- Severity/lens: high / integration_authority
- Original location: `design.md:44-55`; Delta `spec.md:21-33`
- Runtime evidence: existing Ollama request only hard-codes temperature and derives timeout/defaults in code.
- Impact: resource bounds and request shape were not testable.
- Accepted fix: exact field type/default/min/max/grammar/request-location table.
- concernTags: `field-type`, `design-contract`
- verifyString: `Unknown keys, numeric strings, non-finite values and partial invalid objects reject the whole mutation.`

### ROLLOUT-001

- Severity/lens: high / rollout
- Original location: `proposal.md:55-60`; `design.md:78-105`; `tasks.md:36-37`
- Runtime evidence: persistent DB uses WAL; background cycle writes continuously; `openDb` updates schema metadata.
- Impact: copying only the main DB or restoring only the App is not a valid rollback.
- Accepted fix: stop owned writers, use SQLite Backup API, integrity/digest receipt and fixed App+DB restoration order.
- concernTags: `execution-order`, `design-contract`
- verifyString: `Installation never backs up a live WAL database by copying only its main file.`

## Final closer root causes and continuation repairs

### FINAL-EVIDENCE-001

- Repair: this file preserves the complete initial finding structure, pre-fix matrix digest, runtime evidence, accepted fix, concern tags and exact verify string without rewriting the original receipts.
- verifyString: `Pre-fix Contract Matrix digest`

### FINAL-RECOVERY-001

- Repair: Design and Contract Matrix include `projectWrites.ts`, `kanbanAiSuggestions.ts`, generator interfaces and global-summary context propagation.
- verifyString: `The existing intermediary boundaries are part of this contract, not implementation details:`

### FINAL-COMPAT-001

- Repair: Core/UI API contract advances to 6 with three named capabilities and fail-closed mismatch scenarios.
- verifyString: `\`CORE_API_CONTRACT_VERSION\` and \`REQUIRED_CORE_API_CONTRACT_VERSION\` both advance from 5 to 6.`

### FINAL-TELEMETRY-001

- Repair: Design defines separate per-project, run-level, card-write and AI-invocation units with exact equations.
- verifyString: `\`attempted = provider_success + fallback\``

### FINAL-ROLLOUT-001

- Repair: archive/commit precede packaging; identity receipt binds clean revision, package inputs, version, App/DMG and DB snapshot digests with drift invalidation.
- verifyString: `Candidate identity is invalidated by any dirty worktree`

## Continuation review findings and final targeted repair

### CONT-EVIDENCE-001

- Repair: `initial-landing-continuation-receipt.json` is digest-valid and binds the preserved pre-fix matrix digest, all eight complete initial finding ids/severity/original locations/runtime evidence, exact current landed locations, verify strings and `landed: true` results. Original receipts remain unchanged.
- verifyString: `initial-landing-continuation-receipt.json`

### CONT-RECOVERY-001

- Repair: `DraftExecutionContext` now explicitly crosses `KanbanAiTextGenerator`, configured Kanban wrapper, every prompt runner, Ollama fetch and CLI `ExecFileImpl`/child process.
- verifyString: `KanbanAiTextGenerator(prompt, context)`

### CONT-TELEMETRY-001

- Repair: every attempted generation has provider success, committed fallback or failed; Kanban propagates fallback category, defines zero-card success, and defines timeout/malformed/transport failure without violating the equation.
- verifyString: `attempted = provider_success + fallback + failed`

### CLOSER-COMPAT-001

- Repair: `core/test/settings.test.ts` extracts and executes the actual Settings/DB reader from the pinned 0.1.3 revision `3dccf669dc4b952818a89378cf1e4754d708248d` against an upgraded SQLite database. The fixture proves the legacy reader loads `core.custom_agents`, performs a legacy settings write, and leaves `custom_agent_providers_v1` intact for the current reader.
- Verification: Node 22 focused run passes all 25 Settings tests, including the pinned legacy-reader round trip.
- verifyString: `real 0.1.3 settings reader can read and write the upgraded database without erasing provider settings`

### RECOVERY-C4-001

- Repair: `upsertKanbanCandidate` now starts `BEGIN IMMEDIATE`, checks the scheduler owner/generation/live lease inside that transaction, then performs its SELECT and INSERT/UPDATE before releasing the writer lock. Both deterministic scheduler cards and AI cards pass the same fence callback.
- Verification: a two-connection test proves the competing generation update is blocked during the transaction and a stale owner creates no card.
- verifyString: `Kanban upsert holds the SQLite writer lock while checking the scheduler generation fence`

### RECOVERY-C4-002

- Repair: the reconciliation final `BEGIN IMMEDIATE` re-reads the latest successful completion before touching project counters. A competing owner that completed within the fixed cadence supersedes the stale run, which records a failed terminal receipt and returns skipped without counter changes.
- Verification: a two-connection, different-date, cross-midnight test proves only one success and one counter increment.
- verifyString: `final cadence check lets only one different-date reconciliation update counters across two DB connections`
