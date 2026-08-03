---
openspec_level: o1
template_version: owner-workflow/v1
change: fix-automatic-daily-diary-input
reasons: durable_shared_contract,multiple_journeys_roles
---
# Technical Design: Fix automatic Daily diary input

## 中文摘要

修復邊界分成兩個可單獨驗證的契約：scheduler 在執行時把「前一個台北日曆日」作為唯一 target date；Daily diary prompt builder 對手動與自動路徑都輸出同樣的已清理 session/commit evidence。

## Context

- Runtime records show successful scheduler rows and non-zero sessions while active projects still return insufficient-data wording.
- `buildProjectDiaryPrompt` currently omits session `command`/`excerpt` and commit titles even though the configured Daily diary prompt requests concrete work, tests, decisions and commits.
- Settings accepts a 5,000-character override, while `diaryAgent.ts` truncates the final combined prompt to 1,800 characters. Because structured data is appended last, a valid long override can remove the evidence entirely.
- Scheduler output is keyed by the current Taipei date, so a 01:00 run precedes most same-day activity and ordinary ticks skip after success.

## Goals / Non-Goals

### Goals

- Give the agent enough bounded evidence to summarize real activity without raw-log access.
- Make the scheduled diary represent one completed calendar day.
- Preserve explicit manual date selection, confirmed-content protection and durable idempotency.

### Non-Goals

- No schema, UI, provider, model, project-file, or historical-row migration.
- No raw transcript, full log, source-ref, credential or absolute-path inclusion.

## Runtime Path and Data Flow

1. Scheduler resolves `targetDate = previousTaipeiDate(now)` before lease claim.
2. It claims and writes `daily_scheduler_runs`, per-project diaries and `daily_logs` under `targetDate`.
3. Both scheduler and manual regenerate call `regenerateProjectDiaryEntryWithAgent` for an exact date.
4. `buildProjectDiaryPrompt` derives bounded evidence from the date-scoped `ProjectDetailSnapshot`.
5. Session command/excerpt and commit title fields pass through existing redaction plus whitespace/length normalization before entering `STRUCTURED_DATA`.
6. The final prompt budget covers the maximum accepted 5,000-character override plus bounded safety/evidence sections; it never truncates the appended structural boundary for a valid setting.
7. The prompt preamble declares all evidence untrusted and forbids following embedded instructions.

## Decisions

- Chosen: previous-day scheduler target at the configured time. Alternative `23:50` same-day scheduling was rejected because sleep/offline behavior is weaker and the 8/3 runtime evidence showed that later execution alone does not fix missing evidence.
- Chosen: enrich the shared prompt builder. Alternative prompt simplification was rejected because it would discard the user's desired handoff detail and would not explain the manual/automatic discrepancy.
- Chosen: bounded redacted session/commit evidence. Raw transcript or complete excerpts are rejected for privacy and prompt-injection reasons.
- Chosen: align the runtime prompt budget with the existing 5,000-character settings contract plus bounded generated overhead. Tail truncation is rejected because it silently removes the safety/evidence section.

## Contract Inventory

- Existing: `DailySchedulerRuntime.runNow`, `DailySchedulerRuntime.tick`, `regenerateProjectDiaryEntryWithAgent`, `buildProjectDiaryPrompt`, `redactSensitiveText`, settings `MAX_PROMPT_LENGTH=5000`.
- NEW: a small previous-Taipei-date helper or equivalent local function used by scheduler target-date resolution.
- No new database fields or API routes.

## Execution Order and Failure Recovery

- Resolve target date before checking the in-process running flag or claiming the SQLite lease.
- Preserve claim → project outputs → Kanban → highlight/success transaction ordering.
- Provider failure continues to store deterministic fallback; confirmed rows remain protected by the existing transactional status check.

## Security and Privacy

- Protected assets: private session content, source paths, credentials and user trust in AI summaries.
- Trust boundary: local SQLite/session rows to an external local CLI agent prompt.
- Controls: existing secret/path redaction, per-field truncation, total prompt limit, no source refs, no raw transcript, and explicit untrusted-data instruction.
- Tests cover secret-like strings, absolute paths, embedded instructions and source references.

## Migration and Rollback

- No schema/data migration. Existing generated rows remain unchanged unless the user explicitly runs the scheduler again.
- Rollback is a code revert; persisted rows remain valid because keys and schemas are unchanged.

## Risks / Trade-offs

- Redaction is pattern-based and cannot prove semantic de-identification of every possible sentence; keep evidence short and never include raw transcript/source refs.
- The first run after rollout targets yesterday even if a same-date row was previously created by the older build; this is intentional and remains idempotent by date.

## Open Questions

- None. The user approved the previous-day schedule and shared safe-evidence approach.
