# Spec Review State: README Product Guide And Tilde Path Redaction

Spec: `docs/specs/deltas/readme-product-guide-redaction-delta.md`
Route: Level 1
Status: converged
Date: 2026-07-08

## SPEC REVIEW ROUTE

Level: 1
Reason: Delta is small, but it contains load-bearing claims about a shared sensitive-data redaction helper.
Spec: `docs/specs/deltas/readme-product-guide-redaction-delta.md`
Touched surface: `README.md`, `core/src/services/kanbanSynthesis.ts`, `core/test/kanbanSynthesis.test.ts`, `docs/specs/MASTER.md`
Load-bearing claims: README product/install/AI setup coverage; `redactSensitiveText()` redacts `~/...`; validation commands passed.
Plan: Local fact inventory against concrete files and tests.
Subagent attempt: not attempted
Subagents required: no
Subagents used: none
Fallback reason: Level 1 local review is sufficient for a tiny delta and one shared helper fix.
Budget mode: bounded
Required lenses this round: fact-inventory, security-boundary
Deferred lenses: runtime UI smoke, black-box QA
Why deferred: README and redaction helper have no new user workflow, API route, or UI interaction.
Escalation trigger: Any refuted file/function/test claim, new endpoint claim, or credential-handling change.
Round trust policy: required lenses that fail to return structured findings make the round inconclusive; never count inconclusive as clean

## FACT INVENTORY

verifiedFacts:
- claim: README explains product capabilities, download/install, first-run setup, AI setup, prompts, exports, developer commands, packaging path, and architecture.
  status: confirmed
  evidence: `README.md:1-173`
- claim: The README no longer says DevDiary is only a prototype UI or that Core API is not connected.
  status: confirmed
  evidence: `README.md:1-173`
- claim: `redactSensitiveText()` treats `~/...` and `~user/...` as redacted paths.
  status: confirmed
  evidence: `core/src/services/kanbanSynthesis.ts:16`, `core/src/services/kanbanSynthesis.ts:33-39`
- claim: Existing regression input covers `~/Workspace/side-projects/app`, token/password strings, and raw transcript wording.
  status: confirmed
  evidence: `core/test/kanbanSynthesis.test.ts:72-80`
- claim: MASTER indexes this delta.
  status: confirmed
  evidence: `docs/specs/MASTER.md` delta index entry for `readme-product-guide-redaction-delta.md`

alreadyWrongClaims:
- none

summary: Spec claims match the changed files and tests. Review converged.

## SECURITY REVIEW RESULT

Surface: Kanban / scheduler / AI-output redaction helper.
Protected asset: local paths, credentials, secret-like values, raw transcript wording.
Boundary: local parsed/session text and AI-derived summaries before display or generated content persistence.
Input: session command/excerpt text and generated Markdown strings.
Sink: Kanban card titles/descriptions and scheduler/AI summary text that call `redactSensitiveText()`.
Controls present: path regex, secret regexes, raw transcript wording replacement, existing regression test.
Validation performed: targeted redaction test plus full Core test suite.
Verdict: fixed for shell home paths covered by `~/...` and `~user/...`.
Residual risk / proof gap: Other nonstandard path syntaxes are not exhaustively fuzzed; no new sink or credential storage is introduced.
