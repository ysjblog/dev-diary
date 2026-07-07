# Markdown Daily Export And Redacted Backup Test Plan

## Test Depth Route

- Level: 3
- Reason: 新增 Core API、export artifact、Settings UI workflow、persistence read path、secret redaction，跨 Core/UI/SQLite/Browser。
- Required verification: Core unit/integration tests、root UI API helper tests、Core typecheck、root build、API smoke、desktop/mobile Settings UI screenshot、security review、diff check。
- Allowed skips: 不做 raw SQLite export；v1 明確只做 redacted structured export bundle。

## Bug Pattern Coverage

- [x] Input normalization / aliases / format variants
- [x] Boundary values / empty / null / malformed input
- [x] Rule priority conflicts
- [x] Negation / exclusion / opt-out / unlimited
- [x] Contract generated and execution applied
- [x] Operation order invariants
- [x] Production-like dirty data
- [x] Multi-condition combinations
- [x] Security bypass mixed with normal input
- [x] State/history/retry/refresh behavior
- [x] Externally observable result, not only implementation detail

## Runtime Verification Route

- Runtime smoke: REQUIRED
- Black-box QA: REQUIRED
- Safe environment or localhost command: local Core API + local Vite UI。
- Safe test account / mock access: seeded SQLite test DB；no production credentials。
- Forbidden or destructive actions: 不輸出 raw DB dump、不讀 credential files、不讀 raw transcripts、不寫 project folders。

## [x] 【function 邏輯】Markdown daily export uses precedence and totals
**範例輸入**：seeded DB with `global_summary_user`, AI summaries, token usage, and sessions on one date。
**期待輸出**：Markdown contains user global summary first, per-project summaries, total token count, by-agent totals, and session rows without cost fields。

## [x] 【安全繞過】Markdown export redacts secret-like values
**範例輸入**：comment / document / summary content includes `password=...`, API-key-like strings, and `source_log_ref` values。
**期待輸出**：export contains `[REDACTED]`, never raw secret-like values, never raw `source_log_ref`, and never raw transcript/log lines。

## [x] 【資料邊界】Comments are opt-in
**範例輸入**：same date with comments, request with comments disabled and enabled。
**期待輸出**：disabled output has no Comments section content; enabled output includes redacted comments。

## [x] 【Mock API】Daily export endpoint returns downloadable Markdown
**範例輸入**：`GET /api/exports/daily?date=2026-06-30`。
**期待輸出**：HTTP 200, `text/markdown`, attachment filename, Markdown body。

## [x] 【Mock API】Backup endpoint returns redacted structured JSON
**範例輸入**：`GET /api/exports/backup` on seeded DB。
**期待輸出**：HTTP 200, JSON bundle with metadata/projects/sessions/token_usage/daily_logs/comments/project_docs, no raw SQLite file, no raw secrets, no `source_log_ref`。

## [x] 【前端元素】Settings Import / Export buttons call Core endpoints
**範例輸入**：click Markdown export and Backup export buttons。
**期待輸出**：UI calls `/api/exports/daily` and `/api/exports/backup`, downloads returned artifact, and shows success/failure toast。

## [x] 【RWD】Settings export controls work on desktop and mobile
**範例輸入**：desktop 1440x900 and mobile 390x844。
**期待輸出**：Import / Export controls are readable, buttons do not overlap, and status text wraps safely。

## Security Review Result

- Surface: `GET /api/exports/daily`, `GET /api/exports/backup`, Settings export buttons.
- Protected asset: app-owned SQLite content, CLI session metadata, comments, document previews, and secret-like values.
- Boundary: React UI calls Core API; React does not read SQLite or assemble export content.
- Input: date query, include-comments query, persisted app data rows.
- Sink: downloadable Markdown / JSON artifacts.
- Controls present: date validation, parameterized SQL, no raw DB dump route, source log refs omitted, secret-like value redaction, comments opt-in.
- Validation performed: Core tests, API smoke with injected secret-like values, downloaded artifact scan, browser download workflow.
- Verdict: no reportable leak found in covered paths.
- Residual risk / proof gap: redaction is pattern-based and may not catch every future secret format; stronger fixture corpus can be added when more real export examples exist.
