---
openspec_level: o1
template_version: owner-workflow/v1
change: use-same-taipei-day-diary-scheduler
reasons: durable_shared_contract, multiple_journeys_roles
---
# Technical Design: Use same Taipei day for diary scheduler

## 中文摘要

保留 SQLite 裡的 UTC session timestamp，集中提供 SQLite 台北日期／小時 expression 與 TypeScript helper，讓所有讀取用同一個日曆語意。Scheduler 在 scan 後以當日 session existence 建立 eligible project set，並以 semantics marker 安全跨越舊版 success state。

## Context

- `sessions.start_time` values are UTC `Z` timestamps.
- Existing date readers use `substr(start_time,1,10)` in projects, Dashboard, exports and scheduler inputs.
- The runtime database showed 38/202 recent sessions shift dates when converted to Taipei time.
- `project_daily_diaries` had no 2026-08-05 row while the UI rendered a generated fallback from one session.

## Goals / Non-Goals

- Goal: one `Asia/Taipei` calendar boundary for all timestamp-derived day/hour reads.
- Goal: same-day, point-in-time scheduled diary generation for projects with target-date sessions.
- Goal: first-run recovery when an older scheduler meaning has already marked the same date successful.
- Non-goal: mutate raw sessions or destructively rebuild legacy aggregates.
- Non-goal: change the UI fallback presentation in this Change.

## Runtime Path and Data Flow

1. Background cycle scans and persists sessions with UTC timestamps.
2. Scheduler resolves `targetDate = taipeiDate(now)`.
3. Core derives Daily-diary eligible projects by `date(start_time, '+8 hours') = targetDate`.
4. Only eligible projects enter scheduled Daily diary generation; existing Project summary and Kanban stages retain their current all-tracked-project behavior. Manual date regenerate continues to use the exact requested date and same snapshot builder.
5. All timestamp-derived project, Dashboard and export reads use the same Taipei SQL expressions.
6. A successful final transaction records the current scheduler semantics marker in app settings.

## Decisions

- Decision: use session existence on the exact target date, not five-day Workspace tracking status. This has no delayed activation window.
- Decision: same-day point-in-time semantics. At 01:00, later activity is deliberately outside the completed run.
- Decision: keep UTC timestamps as source facts and convert at query boundaries. Rewriting source timestamps was rejected because it loses timezone-neutral provenance.
- Decision: use session rows as the authoritative date-scoped token source. Destructively rebuilding `token_usage` was rejected.
- Decision: settings carries a scheduler semantics marker. A mismatch bypasses an older same-date success once, while the existing lease and confirmed-row guards remain authoritative.

## Contract Inventory

- Existing writers: scan session persistence, scheduler final transaction, app settings.
- Existing readers: `projects.ts`, `dashboard.ts`, `exports.ts`, `dailyScheduler.ts`.
- `NEW`: canonical Taipei SQL date/hour expressions and timestamp-to-Taipei-day helper.
- `NEW`: internal `daily_scheduler.semantics_version` marker in persisted settings.
- Compatibility: existing APIs and tables remain; scheduler result counts describe only eligible projects.

## Execution Order and Failure Recovery

- Scan completes before scheduler eligibility is evaluated in the background cycle.
- Target date and semantics mismatch are resolved before lease claim.
- A valid lease still blocks concurrent ordinary or forced work.
- Confirmed diary status is rechecked transactionally after provider await.
- Semantics marker updates only with durable scheduler success; a failed run remains retryable.

## Security and Privacy

- No new external data or provider fields.
- Eligibility uses counts only; prompt redaction and untrusted-evidence boundaries remain unchanged.
- Runtime smoke and QA use in-memory SQLite/deterministic generators, not the user database or real provider.

## Migration and Rollback

- No destructive data migration. Existing UTC session timestamps and persisted diary rows remain.
- The first eligible run with a missing/old semantics marker may refresh AI-generated same-date output but preserves confirmed rows.
- Rollback restores prior query/target logic; stored marker is ignored by older builds.

## Risks / Trade-offs

- Risk: broader query changes can shift historical counts. Mitigation: cross-module boundary tests around 00:00/08:00 Taipei and full suites.
- Risk: upgrade rerun duplicates work. Mitigation: one marker transition, existing lease, unique rows and confirmed preservation.
- Risk: no project is active at 01:00. Mitigation: successful zero-project run is explicit; Run now/manual regeneration remains available later.

## Open Questions

- None.
