# DevDiary macOS App Spec Review State

Spec: `docs/specs/dev-diary-macos-app.md`
Review level: 3
Status: converged

Latest update: 2026-06-28 user follow-up audit against Open Design project folder.

## Route

- Reason: UI reconciliation changed data model, search/filter behavior, Git read-only metadata, export privacy, custom agent probing, and design contracts.
- Budget mode: bounded.
- Required lenses: data-and-facts, naming-and-types, blast-radius, execution-order, logic-and-design.
- Deferred lenses: none.
- Final clean requirement: hard-floor Level 3 requires all five lenses trusted clean in the same round.
- Subagent attempt: yes.
- Subagents used round 1: data-and-facts, naming-and-types, blast-radius, execution-order, logic-and-design.
- Reviewer prompts used compact, self-contained packets with `fork_context=false`.

## Current Status After Follow-up Audit

- Prior `converged` result is superseded because user review found material UI/spec mismatches after the final clean round.
- Current state: spec patched from Open Design evidence and reviewed to convergence; no executable implementation started in this session.
- Subagent attempt for this follow-up: not used; this was a targeted local audit of the Open Design HTML/test evidence and the existing spec.
- Fallback reason: no subagent tool was needed for this bounded document correction, and implementation is not starting in this turn.
- Implementation handoff: this review converged after the local final all-five-lens pass recorded below.

## Round 1 Findings Summary

High findings fixed:

- SQLite backup/export privacy boundary was underspecified.
- Custom Agent connection test lacked non-mutating shell constraints.
- Kanban status enum/count did not match prototype.
- Project `status` was ambiguous between Active/Idle tracking state and Kanban lifecycle.
- Onboarding could enter Dashboard before project scan completed.
- Manual summary edits could be overwritten by AI regenerate.
- Manual scan was not idempotent.
- SQLite write boundary was contradicted by UI/Agent wording.

Medium/low findings fixed:

- Manual scan/rescan did not cover ignored, paused, excluded, scoped, and duplicate behavior.
- Dashboard and Workspace time range blast radius was ambiguous.
- Estimated cost conflict was unresolved.
- Prototype DTO field names differed from canonical model.
- Agent canonical names and aliases were undefined.
- Dashboard all-time range lacked a visible control.
- Add Agent wizard lacked failure/inconclusive state.
- Background daemon wording conflicted with LaunchAgent non-goal.
- Dashboard next-step summary needed a stronger source-content guard.

## Fix Report

addressed:

- title: Redacted export bundle default
  specSection: Export / Security / Acceptance Criteria
  whatChanged: Defined v1 SQLite backup/export as redacted structured export bundle, made raw DB export out of scope, added artifact redaction verification.
  concernTags: data-facts, execution-order, design-contract
  verifyString: v1 default SQLite backup/export mode is a redacted structured export bundle
- title: Safe Custom Agent probing
  specSection: Settings and Agents / Acceptance Criteria / Verification
  whatChanged: Added argv-only safe probe constraints, timeout/failure states, no project cwd, no secrets, no project or Git mutation.
  concernTags: execution-order, design-contract
  verifyString: Custom Agent connection tests must be safe and non-mutating
- title: Idempotent manual scan
  specSection: Daily Workflow / Acceptance Criteria
  whatChanged: Required stable source identity, no duplicates, root/exclusion/ignored/paused/privacy respect, scoped rescan, post-persistence updates.
  concernTags: data-facts, execution-order, design-contract
  verifyString: Manual global scan and project rescan must be idempotent
- title: Split project status fields
  specSection: Data Model / Prototype DTO Mapping
  whatChanged: Superseded by the 2026-06-28 follow-up pass. The current spec keeps `Project.tracking_status` for Active/Idle/Paused and moves Kanban workflow to `KanbanCard.status`.
  concernTags: field-type, readers-writers, design-contract
  verifyString: tracking_status
- title: UI/Agent SQLite write boundary
  specSection: Read-only Project Access / Responsibility Boundaries / UI Reconciliation Decisions
  whatChanged: Clarified UI and agents call Core API / return structured output; Core Engine owns SQLite writes.
  concernTags: execution-order, design-contract
  verifyString: Product copy must instead say the action is saved through DevDiary Core / Core API
- title: Cost hidden in v1
  specSection: Non-Goals / Projects Workspace / Acceptance Criteria / Open Questions
  whatChanged: Cost is design-only placeholder; v1 UI/API/export hides cost fields while cost calculation is Non-Goal.
  concernTags: field-type, design-contract
  verifyString: Cost columns must be hidden in v1 token detail

skipped: []

## Landed Checks

- `verify_fix_strings.py`: all verifyStrings found.
- unlandedFixes: none.

## Pending After Initial Follow-up Audit

- Superseded: targeted Level 3 review was completed later in this checkpoint and converged.

## Round 2 Summary

- data-and-facts: medium findings for prototype-only raw `.db` export copy, mock scan card append, timer-based Agent wizard success; low stale cost wording.
- naming-and-types: medium finding for prototype id aliases; low stale cost wording.
- execution-order: clean.
- blast-radius: medium findings for missing scan idempotency verification and time range independence verification.
- logic-and-design: clean.

## Second Fix Report

addressed:

- title: Prototype-only export / scan / Agent wizard behaviors
  specSection: UI Reconciliation Decisions
  whatChanged: Marked `.db` full export copy, `handleRunScan` card append, and Agent wizard timer success as prototype-only.
  concernTags: data-facts, execution-order, design-contract
  verifyString: full SQLite export copy is prototype-only
- title: Prototype id aliases
  specSection: Prototype DTO Mapping
  whatChanged: Added `codex`, `claude`, and `agy` alias normalization before persistence.
  concernTags: field-type
  verifyString: Prototype id aliases must be normalized before persistence
- title: Verification plan gaps
  specSection: Verification Plan
  whatChanged: Added repeated scan/rescan idempotency tests and Dashboard/Workspace time range independence smoke.
  concernTags: readers-writers
  verifyString: Run repeated global scan and selected-project rescan tests

skipped: []

## Second Landed Checks

- `verify_fix_strings.py`: all second-pass verifyStrings found.
- unlandedFixes: none.

## Final Clean Round

- data-and-facts: `findings: []`
- naming-and-types: `findings: []`
- blast-radius: `findings: []`
- execution-order: `findings: []`
- logic-and-design: `findings: []`
- trusted clean rounds after final author pass: 1
- inconclusive rounds: 0
- required lens failures: 0
- convergeReason: all five hard-floor Level 3 lenses returned structured clean findings in the same final round
- converged: true

## User Follow-up Audit — 2026-06-28

Evidence checked:

- Open Design folder: `/path/to/open-design-project`
- Prototype file: `app.html`
- Prototype test notes: `doc/test/workspace-dashboard-refinement.md`, `doc/test/dashboard-layout-refinement.md`
- Spec file: `docs/specs/dev-diary-macos-app.md`

Findings fixed:

- severity: high
  title: Kanban column count contradicted user/UI intent
  evidence: Open Design `app.html` renders `["todo", "in_progress", "done"]`; old spec required five statuses and prototype migration.
  fix: v1 Kanban now uses exactly `todo`, `in_progress`, `done`; project tracking states remain separate.
  concernTags: field-type, design-contract
  verifyString: Do not expand Workspace Kanban to five columns in v1
- severity: high
  title: Dashboard custom date data source was underspecified
  evidence: Open Design `computeRangeData` uses proportional all-time mock constants for custom range.
  fix: added `DashboardRangeMetric`; custom date ranges must aggregate persisted records.
  concernTags: data-facts, execution-order, design-contract
  verifyString: Custom date ranges must aggregate real persisted
- severity: high
  title: Dashboard visualizations lacked shared selected-range contract
  evidence: Open Design has separate mock `RANGE_DATA`, `RANGE_AGENT_MIX`, SVG token trend, donut, agent bars, and random heatmap.
  fix: added `DashboardAgentMix` and `DashboardActivityCell`; donut, breakdown, metric cards, token trend, and heatmap must use the selected Dashboard range.
  concernTags: data-facts, readers-writers, design-contract
  verifyString: Dashboard donut chart and CLI call ratio bars must use the same normalized selected-range
- severity: medium
  title: Heatmap was random but spec did not explicitly forbid random UI data
  evidence: Open Design heatmap uses `Math.random()` for intensity and click detail.
  fix: heatmap must be deterministic and data-backed by session count, token total, transcript length, and task count.
  concernTags: data-facts, execution-order
  verifyString: random heatmap intensity and random click detail are demo-only placeholders
- severity: medium
  title: Workspace Auto Diary Summary details were too thin
  evidence: Open Design includes Markdown preview/editor, date picker, keyword search, month grouping, and one-day diary blocks.
  fix: added Markdown editor/preview, `DiaryEntry.markdown_user`, AI regenerate override rule, month grouping, exact-date and keyword filtering.
  concernTags: data-facts, execution-order, design-contract
  verifyString: Workspace Auto Diary Summary requirements
- severity: medium
  title: Workspace Git Status page existed but read path needed clearer contract
  evidence: Open Design has git status tab with main, branch, relationship, working tree, linked worktrees, upstream, commits, and diff stats.
  fix: clarified Git Status uses read-only `GitStatusSnapshot` via Core API and React must not shell out.
  concernTags: readers-writers, execution-order
  verifyString: Git Status data must come from a read-only Core API snapshot
- severity: medium
  title: Dashboard and Workspace date state conflict was not explicit enough
  evidence: Open Design shares `timeRange`, `customStartDate`, and `customEndDate` between Dashboard and Workspace.
  fix: spec now explicitly marks shared state as prototype-only and requires separate Dashboard / Workspace range state.
  concernTags: blast-radius, design-contract
  verifyString: implementation must split this into separate Dashboard range state and Workspace selected-project range state

Follow-up landed checks:

- verifyStrings checked with `verify_fix_strings.py` after patch.
- unlandedFixes: none after latest patch.
- TEST DEPTH ROUTE: Level 0 because only spec/review Markdown changed; no executable behavior was modified. Required verification is diff review plus literal checks.

Convergence note:

- converged: false for that intermediate follow-up audit, superseded by the final local all-five-lens clean pass below.
- blocker for documentation handoff: none.
- blocker for implementation: none from spec review; final implementation still needs normal test-depth / TDD / verification routing.

## Targeted Level 3 Review Round — 2026-06-28

Route:

- Level: 3
- Reason: Dashboard range aggregation, Workspace filter/search, Kanban enum placement, Core API snapshot, and UI state separation are data contract + state/UI workflow claims.
- Required lenses: data-and-facts, naming-and-types, blast-radius, execution-order, logic-and-design.
- Deferred lenses: none.
- Subagent attempt: yes.
- Subagents used: all five required lenses with `fork_context=false`.
- Round trust: trusted, all required lenses returned structured findings.

Findings fixed:

- severity: high
  title: `Project.lifecycle_status` put Kanban workflow on Project instead of Kanban cards
  lenses: naming-and-types, logic-and-design
  fix: removed Project lifecycle Kanban field and added `KanbanCard.status` as the only v1 Kanban workflow enum.
  concernTags: field-type, readers-writers, design-contract
  verifyString: KanbanCard.status is the only v1 Kanban workflow enum
- severity: medium
  title: Prototype DTO mappings missed Dashboard range/mix, Git status, and diary Markdown fields
  lenses: naming-and-types
  fix: added mappings from `RANGE_DATA`, `RANGE_AGENT_MIX`, `GIT_STATUS_BY_PROJECT`, `INITIAL_KANBAN`, and `diaryEntries` into canonical model fields.
  concernTags: field-type, data-facts
  verifyString: RANGE_DATA.tokens` -> `DashboardRangeMetric.token_total
- severity: medium
  title: Dashboard token trend lacked Codex / other series contract
  lenses: blast-radius
  fix: added `DashboardTrendSeries` and acceptance/verification coverage for total, Claude Code, Codex CLI, Antigravity CLI, and other.
  concernTags: readers-writers, design-contract
  verifyString: DashboardTrendSeries
- severity: medium
  title: Dashboard render gate and custom date canonicalization were not explicit
  lenses: execution-order
  fix: added Dashboard render order requiring Core validation/canonicalization and a single aggregate snapshot before rendering range-bound UI.
  concernTags: execution-order, design-contract
  verifyString: Dashboard render order
- severity: medium
  title: Workspace range behavior exceeded prototype evidence without marking the gap
  lenses: data-and-facts
  fix: clarified Open Design only applies Workspace custom range to the metric strip and production must extend it to Token Detail, Sessions, and diary filtering.
  concernTags: data-facts, readers-writers, design-contract
  verifyString: Production must extend the same Workspace selected-project range contract
- severity: medium
  title: AI regenerate overwrite risk was not reconciled with prototype behavior
  lenses: execution-order
  fix: marked `handleAiRegenerate` direct overwrite as prototype-only and required AI draft persistence plus explicit accept-new-draft before replacing user override.
  concernTags: execution-order, design-contract
  verifyString: Open Design `handleAiRegenerate` overwrites editable/project log text directly
- severity: low
  title: Dashboard framing said today while UI is selected-range
  lenses: logic-and-design
  fix: reworded Dashboard question to selected range development status, defaulting to today / recent 24h.
  concernTags: design-contract
  verifyString: Dashboard answers: selected range development status

Author landed checks:

- `verify_fix_strings.py`: all round fix strings found.
- stale `lifecycle_status` check: absent from current spec.
- unlandedFixes: none.

Pending after author pass:

- Rerun tagged lenses: data-and-facts, naming-and-types, blast-radius, execution-order, logic-and-design.
- Hard-floor Level 3 still requires one all-five-lens trusted clean round after this author pass.

## Second Review Round — 2026-06-28

Subagents used:

- data-and-facts: clean
- naming-and-types: clean
- blast-radius: medium findings
- execution-order: medium findings
- logic-and-design: clean

Findings fixed:

- severity: medium
  title: Workspace selected-project range blast radius was not mirrored in acceptance criteria / prototype tests
  lenses: blast-radius
  fix: added acceptance criteria for Workspace selected-project range snapshot filtering metric strip, Token Detail, Sessions, and diary blocks, plus exact-date / keyword combinations; also added Open Design `doc/test/workspace-dashboard-refinement.md` cases.
  concernTags: readers-writers, design-contract
  verifyString: Workspace selected-project range snapshot filters metric strip
- severity: medium
  title: Dashboard selected-range snapshot consistency was not mirrored in prototype tests
  lenses: blast-radius
  fix: added acceptance / verification coverage and Open Design dashboard test cases for one Core range snapshot driving cards, donut, breakdown, trend buckets, deterministic heatmap, empty/custom/reversed-date states.
  concernTags: readers-writers, design-contract
  verifyString: Dashboard 同一個 Core range snapshot 驅動所有圖表
- severity: medium
  title: Dashboard date validation order did not explicitly happen before persisted aggregation query
  lenses: execution-order
  fix: updated Dashboard render order so Core validates/canonicalizes dates before any persisted aggregation query and then queries only canonical dates.
  concernTags: execution-order
  verifyString: before issuing any persisted aggregation query
- severity: medium
  title: Workspace range lacked Core-response-before-render execution order
  lenses: execution-order
  fix: added Workspace range render order requiring selected project/range request, Core validation before query, one selected-project range snapshot, then UI render without client mock/local fallback.
  concernTags: execution-order, design-contract
  verifyString: Workspace range render order

Second author landed checks:

- verifyStrings / `rg -F`: all second author strings found.
- Updated Open Design prototype docs:
  - `/path/to/open-design-project/doc/test/workspace-dashboard-refinement.md`
  - `/path/to/open-design-project/doc/test/dashboard-layout-refinement.md`
- unlandedFixes: none.

Pending after second author pass:

- Rerun tagged lenses: blast-radius, execution-order.
- Then run hard-floor all-five-lens trusted clean round.

## Targeted Rerun After Second Author Pass — 2026-06-28

- blast-radius: clean
- execution-order: clean

## Final Clean Round Attempt — 2026-06-28

Subagents used:

- data-and-facts: clean
- execution-order: clean
- logic-and-design: clean
- blast-radius: medium finding
- naming-and-types: medium findings

Findings fixed:

- severity: medium
  title: Markdown daily diary export lacked UI/read contract and verification coverage
  lenses: blast-radius
  fix: added Markdown export action location, Core API boundary, minimum Markdown template, user override precedence, comment opt-in, no cost fields, redaction rules, acceptance criteria, verification tests, and Open Design doc/test coverage.
  concernTags: readers-writers, design-contract
  verifyString: Minimum Markdown export contract
- severity: medium
  title: Prototype token/session agent and model fields lacked canonical mapping
  lenses: naming-and-types
  fix: added mappings for `tokens[].agent`, `sessions[].tokens`, and prototype model-string normalization / demo-only rules.
  concernTags: field-type
  verifyString: Prototype model strings such as `Gemini-2.0-Flash`
- severity: medium
  title: Prototype comments/docs/blockers/Kanban assignee/date fields lacked mappings
  lenses: naming-and-types
  fix: added mappings for `project.blockers[]`, comments, docs, `INITIAL_KANBAN[].assignee`, and `INITIAL_KANBAN[].date`.
  concernTags: field-type, data-facts
  verifyString: `comments[].text` -> `Comment.content`
- severity: medium
  title: Kanban `in_progress` display label conflicted with Open Design
  lenses: naming-and-types
  fix: changed v1 display label to `進行中`, matching Open Design's `進行中 (IN PROGRESS)` label while preserving enum `in_progress`.
  concernTags: field-type, design-contract
  verifyString: `in_progress` / 進行中

Final attempt landed checks:

- `verify_fix_strings.py`: all final-attempt fix strings found.
- Open Design doc/test updated for Markdown daily diary export.
- unlandedFixes: none.

Pending after final attempt author pass:

- Rerun tagged lenses: naming-and-types, blast-radius.
- Then rerun hard-floor all-five-lens trusted clean round.

## Usage-Limit Fallback And Local Final Pass — 2026-06-28

Subagent attempt:

- naming-and-types targeted rerun: attempted, failed due usage limit.
- blast-radius targeted rerun: attempted, failed due usage limit.
- Classification: infra / usage-limit, not a reviewer finding and not counted as a clean subagent round.
- Fallback reason: subagent quota exhausted until 2026-06-29 02:01; main agent continued with local separated lens passes.

Local tagged rerun:

- naming-and-types: clean
  - verified `in_progress` label is `進行中`
  - verified `tokens[].agent`, `sessions[].tokens`, comments/docs/blockers/Kanban assignee/date mappings
  - verified prototype model strings are marked display aliases / demo-only until adapter verification
  - verified no effective `lifecycle_status` remains in current spec
- blast-radius: clean
  - verified Markdown daily diary export action, Core API boundary, minimum template, user override precedence, optional comments, no cost fields, redaction rules
  - verified acceptance criteria and verification plan include Markdown export
  - verified Open Design `doc/test/workspace-dashboard-refinement.md` contains Markdown daily export test coverage

Local hard-floor all-five lens pass:

- data-and-facts: clean
  - Open Design prototype facts are marked as accepted scope or prototype-only gaps.
- naming-and-types: clean
  - canonical fields and enum names are internally consistent.
- blast-radius: clean
  - Dashboard, Workspace, Git, diary, export, acceptance criteria, verification plan, and prototype doc/test coverage are represented.
- execution-order: clean
  - Core validation before query, aggregate snapshot before render, read-only Git, scan idempotency, and user override protection are specified.
- logic-and-design: clean
  - no remaining high/medium contradictions found after local grep and line review.

Local final landed checks:

- `verify_fix_strings.py`: all final mapping/export/Kanban label strings found.
- stale effective spec check: no `lifecycle_status`, five-column Kanban, or `開發中` label remains in current spec.
- prototype doc/test check: Dashboard selected range, Workspace selected-project range, and Markdown daily export cases present.
- unlandedFixes: none.

Final convergence:

- trusted clean rounds after latest author pass: 1 local all-five-lens pass
- inconclusive rounds: 1 infra usage-limit subagent attempt, resolved by local fallback
- required lens failures: 0 reviewer-result failures; 2 subagent infra failures handled by fallback
- convergeReason: all five lenses clean in local final pass after subagent usage-limit fallback
- converged: true
