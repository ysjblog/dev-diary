# Spec Review State: Kanban Hybrid Status Rules and Manual Lock Badge

## Route

```text
SPEC REVIEW ROUTE
Level: 3
Reason: Cross-module Kanban status rules, UI workflow, persisted state lock semantics, and future AI candidate boundary.
Spec: docs/specs/deltas/kanban-hybrid-status-lock-delta.md
Touched surface: Core kanban synthesis, scan upsert, project write status lock, API mapper, Workspace Kanban UI, docs/tests.
Load-bearing claims: status_locked_by_user exists in Core snapshot; status lock is set on manual move; scan upsert preserves locked status; UI mapper can expose lock field; stable source_ref controls repeated scan dedupe.
Plan: local five-lens review against runtime code; no subagent due platform delegation policy.
Subagent attempt: not spawned
Subagents required: normally Level 2+ would attempt reviewer subagents
Subagents used: none
Fallback reason: current tool policy only allows subagents when the user explicitly asks for subagents/delegation; user requested review but not subagents.
Budget mode: bounded local review
Required lenses this round: data-and-facts, naming-and-types, blast-radius, execution-order, logic-and-design
Deferred lenses: none
Why deferred: hard-floor Level 3 kept all five lenses in scope
Escalation trigger: any missing field/path, lock overwrite risk, produced-but-not-consumed UI flag, or AI write path ambiguity
Round trust policy: required lenses that fail to return structured findings make the round inconclusive; never count inconclusive as clean
```

## Fact Inventory

```text
FACT INVENTORY
verifiedFacts:
- claim: Core snapshot includes status_locked_by_user on KanbanCard.
  status: confirmed
  evidence: core/src/services/projects.ts selects and maps status_locked_by_user; core/src/domain/types.ts defines KanbanCard.status_locked_by_user.
- claim: Manual status moves set the lock.
  status: confirmed
  evidence: core/src/services/projectWrites.ts updateKanbanCardStatus updates status_locked_by_user = 1.
- claim: Scan upsert preserves locked status.
  status: confirmed
  evidence: core/src/services/scans.ts uses CASE WHEN status_locked_by_user = 1 THEN status ELSE @status END.
- claim: Current UI mapper does not yet expose the lock flag.
  status: confirmed
  evidence: src/api/projects.js toKanbanCardView maps sourceRef but not status_locked_by_user.
- claim: Current synthesis has session and commit cards but no explicit TODO debt rule.
  status: confirmed
  evidence: core/src/services/kanbanSynthesis.ts builds session in_progress and recent commit done cards.
alreadyWrongClaims: []
summary: Spec matches existing persistence/upsert semantics and correctly identifies missing mapper/UI and TODO synthesis work.
```

## Review Round 1

```text
findings: []
```

Lenses covered:

- data-and-facts: clean
- naming-and-types: clean
- blast-radius: clean
- execution-order: clean
- logic-and-design: clean

## Completion

```text
converged: true
trustedRounds: 1
inconclusiveRounds: 0
highFindingsFixed: 0
mediumFindingsFixed: 0
unresolvedRisk: Future AI-authored card copy is intentionally excluded from this implementation and must get its own strict JSON contract before auto-writing cards.
nextStep: test-depth-router then tdd-workflow
```
