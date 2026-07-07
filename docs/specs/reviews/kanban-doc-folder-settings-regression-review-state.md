# Spec Review State: Kanban Docs Folder Settings Regression

Spec: `docs/specs/deltas/kanban-doc-folder-settings-regression-delta.md`
Status: converged
Updated: 2026-07-06

## Route

SPEC REVIEW ROUTE
Level: 2
Reason: Regression delta documents cross-module Settings UI, API helper, runtime capability, and Docs scan behavior.
Spec: `docs/specs/deltas/kanban-doc-folder-settings-regression-delta.md`
Touched surface: `src/App.jsx`, `src/api/settings.js`, `src/api/projects.js`, UI API tests, QA docs/screenshots.
Load-bearing claims: `kanban.ai-sync` capability gate; `selectedFolderToProjectDocFolder` detected project path conversion; `docs/specs` placeholder; stale Core 404 guidance; QA screenshot/test paths.
Plan: local fact inventory across code/tests/docs, then required Level 2 lenses.
Subagent attempt: not spawned.
Subagents required: Level 2 router normally requires an attempt when tooling allows.
Subagents used: none.
Fallback reason: available subagent tool policy says not to spawn unless the user explicitly asks for subagents; user asked for commit/package, not delegation.
Budget mode: bounded.
Required lenses this round: data-and-facts, naming-and-types, blast-radius.
Deferred lenses: execution-order, logic-and-design.
Why deferred: no new endpoint, state machine, scheduler, or produced-but-unconsumed contract; implementation already verified via runtime smoke.
Escalation trigger: any wrong field/route/file path claim or missing downstream reader/writer.
Round trust policy: required lenses that fail to return structured findings make the round inconclusive; never count inconclusive as clean.

## Fact Inventory

verifiedFacts:
- claim: Settings runtime capability gate includes `kanban.ai-sync`.
  status: confirmed
  evidence: `src/api/settings.js:9-19`, `src/api/settings.test.js:285-317`
- claim: Folder picker uses detected project paths before Project Roots.
  status: confirmed
  evidence: `src/App.jsx:2802`, `src/App.jsx:2968`, `src/App.jsx:3027`, `src/api/settings.js:312-330`
- claim: Selected `/project/docs/specs` converts to `docs/specs`.
  status: confirmed
  evidence: `src/api/settings.test.js:54-62`
- claim: Settings UI placeholder and guidance use `docs/specs`.
  status: confirmed
  evidence: `src/App.jsx:3173-3174`
- claim: Kanban helper 404 now shows stale Core guidance.
  status: confirmed
  evidence: `src/api/projects.js:21-29`, `src/api/projects.test.js:91-111`
- claim: QA doc and screenshots exist at the paths listed in the delta.
  status: confirmed
  evidence: `doc/test/kanban-doc-folder-settings-regression.md`, `output/playwright/kanban-docs-regression-desktop.png`, `output/playwright/kanban-docs-regression-mobile.png`, `output/playwright/kanban-docs-regression-mobile-docs.png`

alreadyWrongClaims:
- none

summary: Delta claims match current code/test artifact names and runtime contract.

## Lens Results

data-and-facts:
findings: []

naming-and-types:
findings: []

blast-radius:
findings: []

## Convergence

trustedRounds: 1
inconclusiveRounds: 0
converged: true
unresolvedRisk: none blocking; no subagent review due tool policy fallback.
