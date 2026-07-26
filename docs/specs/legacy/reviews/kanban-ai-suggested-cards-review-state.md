# Spec Review State: Kanban AI Auto-added Cards

## Route

```text
SPEC REVIEW ROUTE
Level: 3
Reason: AI/NL parsing, automatic SQLite write path, new Local HTTP API route, scheduler/background runner integration, settings migration, strict JSON contract, and sensitive session/doc/comment prompt boundaries.
Spec: docs/specs/deltas/kanban-ai-suggested-cards-delta.md
Touched surface: Core AI generator adapter, KanbanAiPromptInput prompt package, Kanban suggestion parser, auto-add write path, settings prompts/settings schema, scan/project scan/scheduler/background runner integration, server routes, UI source badges/sync summary, tests, QA docs.
Load-bearing claims: existing Kanban source_ref upsert/status lock semantics must be reused; ProjectDetailSnapshot contains root_path/source_log_ref/docs/comments and must not be sent raw; existing AI diary agent is markdown-oriented and cannot count as JSON success; settings ai_prompts currently have fixed keys and AI_PROMPTS_VERSION = 2; background runner currently gates scan on daily_scheduler.enabled; scan failure boundary currently catches thrown errors as failed scan.
Plan: Level 3 all-five-lens review against runtime code; spawn reviewer subagent before implementation; patch spec until high/medium findings are addressed; verify landed strings; rerun clean pass before implementation.
Subagent attempt: spawned reviewer subagent Carver (0190abcd-ef00-7000-8000-00000000000f), then closed it after Round 1; spawned clean-pass reviewer Nash (0190abcd-ef00-7000-8000-000000000010) after author fixes.
Subagents required: yes, Level 2+ and user explicitly asked why no subagent review
Subagents used: 2
Fallback reason: none after explicit user request; previous local-only review was superseded by this subagent review state
Budget mode: bounded Level 3 review
Required lenses this round: data-and-facts, naming-and-types, blast-radius, execution-order, logic-and-design
Deferred lenses: none
Why deferred: hard-floor Level 3 keeps all five lenses in scope
Escalation trigger: AI/client-controlled source_ref, full ProjectDetailSnapshot prompt leakage, status lock bypass, provider failure escaping scan/scheduler/background runner, settings migration losing existing prompts, background runner silently not running auto-add
Round trust policy: required lenses that fail to return structured findings make the round inconclusive; never count inconclusive as clean
```

## Fact Inventory

```text
FACT INVENTORY
verifiedFacts:
- claim: ProjectDetailSnapshot includes fields that cannot be sent raw to AI prompt.
  status: confirmed
  evidence: core/src/domain/types.ts:277 project snapshot includes project.root_path, sessions, comments, docs; core/src/domain/types.ts:240 includes source_log_ref; core/src/services/projects.ts:367 returns ProjectDoc.content.
- claim: Existing Kanban upsert identity is project_id + source_ref, and locked status is preserved only when the same source_ref matches.
  status: confirmed
  evidence: core/src/services/scans.ts:464 selects by project_id/source_ref; core/src/services/scans.ts:487 preserves status when status_locked_by_user = 1.
- claim: Manual card moves set status_locked_by_user = 1.
  status: confirmed
  evidence: core/src/services/projectWrites.ts updateKanbanCardStatus writes locked manual status.
- claim: Existing AI generation infrastructure is diary-oriented markdown, not strict JSON Kanban suggestions.
  status: confirmed
  evidence: core/src/services/diaryAgent.ts ProjectSummary/DailySummary generators return DiaryDraftResult.markdown.
- claim: Existing settings ai_prompts validation only accepts project_diary, daily_diary_entry, and daily_highlight; AI_PROMPTS_VERSION is 2.
  status: confirmed
  evidence: core/src/services/settings.ts:128 AI_PROMPTS_VERSION = 2; core/src/services/settings.ts:504 normalizeAiPrompts rejects unknown ai_prompts keys.
- claim: Existing UI settings mapper only round-trips three diary prompt keys.
  status: confirmed
  evidence: src/api/settings.js:341 and src/api/settings.js:376 map project_diary, daily_diary_entry, daily_highlight only.
- claim: Existing background runner skips the whole cycle when daily_scheduler.enabled is false.
  status: confirmed
  evidence: core/src/services/backgroundRunner.ts:79 returns skipped before scan.
- claim: Existing scan toast does not distinguish deterministic cards from AI cards.
  status: confirmed
  evidence: src/App.jsx:1005 and src/App.jsx:1046 report inserted_kanban_cards only.
alreadyWrongClaims:
- specClaim: source_ref format included status.
  reality: This would create a new identity when status changes and can bypass locked-card dedupe.
  evidence: Fixed in current spec by removing status from source_ref.
- specClaim: service input was ProjectDetailSnapshot.
  reality: Snapshot contains root path/source_log_ref/docs.content/comments and is too broad for prompt input.
  evidence: Fixed in current spec by requiring KanbanAiPromptInput allowlist DTO.
summary: The feature is implementable only if AI is a candidate generator, while Core owns prompt redaction, stable identity, validation, non-throwing provider boundaries, settings gates, and status-lock-safe writes.
```

## Review Round 1 - Subagent Findings

```text
findings:
- severity: high
  title: source_ref 把 status 放進 key，會繞過 locked card dedupe
  location: docs/specs/deltas/kanban-ai-suggested-cards-delta.md
  evidence: Existing upsert finds cards by project_id + source_ref; mutable status in source_ref would produce a second card after status changes.
  suggestedFix: Remove status from canonical source_ref and use stable normalized dedupe/evidence identity.
- severity: high
  title: Prompt input 邊界太寬，ProjectDetailSnapshot 可能把絕對路徑與原始文件內容送進 AI
  location: docs/specs/deltas/kanban-ai-suggested-cards-delta.md
  evidence: ProjectDetailSnapshot includes root_path, sessions.source_log_ref, docs/content, comments.
  suggestedFix: Add a redacted allowlist DTO such as KanbanAiPromptInput and forbid serializing the whole snapshot.
- severity: high
  title: background runner integration 與 settings gate 未對齊
  location: docs/specs/deltas/kanban-ai-suggested-cards-delta.md
  evidence: Existing background runner returns skipped when daily_scheduler.enabled is false before scan.
  suggestedFix: Define kanban_ai_auto_add.enabled independently from daily_scheduler.enabled and add background runner acceptance cases.
- severity: medium
  title: provider failure 若丟出錯誤，會讓 scan 失敗而不是只回 warning
  location: docs/specs/deltas/kanban-ai-suggested-cards-delta.md
  evidence: runManualScan wraps transaction and returns status failed if errors escape.
  suggestedFix: Require a non-throwing AI auto-add boundary that converts provider/JSON failures into skipped/warnings.
- severity: medium
  title: settings schema 與 AI_PROMPTS_VERSION migration 決策不夠明確
  location: docs/specs/deltas/kanban-ai-suggested-cards-delta.md
  evidence: settings whitelist and UI mapper do not include kanban_ai_auto_add or ai_prompts.kanban_cards; AI_PROMPTS_VERSION is 2.
  suggestedFix: Require settings normalization/defaults/persistence, prompt default, UI mapper, tests, and explicit version bump.
- severity: low
  title: UI scan wording 未要求區分 deterministic cards 與 AI auto-added cards
  location: docs/specs/deltas/kanban-ai-suggested-cards-delta.md
  evidence: Existing scan toast reports only inserted_kanban_cards.
  suggestedFix: Require API/UI to separate deterministic and ai_sync counts.
```

## Author Fix Report

```text
FIX REPORT
addressed:
- title: source_ref 把 status 放進 key，會繞過 locked card dedupe
  specSection: 新增 / 修改 / 驗收條件
  whatChanged: Replaced source_ref format with stable identity that excludes mutable status and added acceptance check that source_ref does not contain status.
  concernTags: data-facts, execution-order, design-contract
  verifyString: ai-suggest://p{projectId}/{hash(normalized dedupe_key + stable evidence identity)}
- title: Prompt input 邊界太寬，ProjectDetailSnapshot 可能把絕對路徑與原始文件內容送進 AI
  specSection: 新增 / 移除 / 影響範圍 / 驗收條件
  whatChanged: Added KanbanAiPromptInput allowlist DTO, forbade raw ProjectDetailSnapshot serialization, listed forbidden root_path/source_log_ref/docs.content/comments raw content fields, and added prompt-injection boundary.
  concernTags: data-facts, field-type, design-contract
  verifyString: KanbanAiPromptInput
- title: background runner integration 與 settings gate 未對齊
  specSection: 新增 / 影響範圍 / 驗收條件
  whatChanged: Defined kanban_ai_auto_add.enabled as independent from daily_scheduler.enabled and required background runner scan/AI auto-add acceptance coverage.
  concernTags: readers-writers, execution-order
  verifyString: daily_scheduler.enabled
- title: provider failure 若丟出錯誤，會讓 scan 失敗而不是只回 warning
  specSection: 新增 / 驗收條件
  whatChanged: Added non-throwing boundary requirement for provider/auth/timeout/invalid JSON/schema rejection failures.
  concernTags: execution-order, design-contract
  verifyString: non-throwing boundary
- title: settings schema 與 AI_PROMPTS_VERSION migration 決策不夠明確
  specSection: 新增 / 影響範圍 / 驗收條件
  whatChanged: Added top-level whitelist, UI mapper, tests, explicit AI_PROMPTS_VERSION 2 to 3 bump, and old-settings preservation requirement.
  concernTags: field-type, readers-writers
  verifyString: AI_PROMPTS_VERSION
- title: UI scan wording 未要求區分 deterministic cards 與 AI auto-added cards
  specSection: 新增 / 驗收條件
  whatChanged: Required scan/project rescan response and UI toast to separate deterministic synthesis counts from ai_sync counts.
  concernTags: readers-writers, design-contract
  verifyString: deterministic synthesis counts
skipped: []
summary: All Round 1 findings were addressed in the spec before implementation.
```

Verify strings checked with `grep -F`:

- `ai-suggest://p{projectId}/{hash(normalized dedupe_key + stable evidence identity)}`
- `KanbanAiPromptInput`
- `daily_scheduler.enabled`
- `non-throwing boundary`
- `AI_PROMPTS_VERSION`
- `deterministic synthesis counts`

## Security Review

```text
SECURITY REVIEW RESULT
Surface: AI-generated Kanban candidate extraction and automatic Core write path
Protected asset: local session metadata, project root privacy, docs/comments content, app-owned SQLite Kanban records, manual user status decisions, provider credentials/secrets
Boundary: Core-to-local AI provider, browser-to-Core Local HTTP API, AI output-to-Core validation, scan/scheduler/background runner-to-write path
Input: redacted KanbanAiPromptInput, AI JSON output, settings prompt text, browser ai-sync request
Sink: kanban_cards SQLite rows, Workspace Kanban UI, scan/scheduler/background runner summaries
Controls present in spec: strict JSON schema, prompt allowlist DTO, secret/path redaction, Core-generated source_ref, stable identity excluding status, confidence/evidence gates, status_locked_by_user preservation, non-throwing provider boundary, settings opt-in default false, local-only Core route, no project folder mutation
Validation performed: spec review against existing code paths and subagent review findings; implementation must add regression tests and browser/RWD QA before commit
Verdict: spec-level controls are adequate after Round 1 fixes, pending clean-pass review result
Residual risk / proof gap: no executable code exists yet, so runtime proof is deferred to test-depth-router, tdd-workflow, typecheck/build, and browser/black-box QA during implementation
```

## Review Round 2 - Subagent Clean Pass

```text
findings: []
converged: true
```

Lenses covered in final clean pass:

- data-and-facts: clean after source_ref, prompt DTO, background runner, provider failure, settings, and UI wording fixes
- naming-and-types: clean; new `KanbanAiPromptInput`, `KanbanSuggestion`, `KanbanAiSyncResult`, `kanban_ai_auto_add`, and `ai_prompts.kanban_cards` names are explicit
- blast-radius: clean; Core services, settings, scheduler/background runner, API, UI mapper, UI, CSS, tests, docs, and QA are listed
- execution-order: clean; provider failure is non-throwing, status lock is checked on stable identity, and settings gates are ordered before provider calls
- logic-and-design: clean; AI generates candidates, Core validates and auto-adds only gated cards, manual status locks remain authoritative

## Completion

```text
converged: true
trustedRounds: 2
inconclusiveRounds: 0
subagentsUsed: 2
highFindingsFixed: 3
mediumFindingsFixed: 2
lowFindingsFixed: 1
unresolvedRisk: Implementation must still prove prompt allowlist/redaction, strict JSON parsing, stable source_ref dedupe, status-lock preservation, settings migration, provider-failure non-throwing behavior, background runner gate independence, UI labels, typecheck/build, and browser/RWD QA.
nextStep: test-depth-router then tdd-workflow before executable implementation.
```
