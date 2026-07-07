# Delta Spec: Markdown Daily Export And Redacted Backup
> PR: feature/core-engine
> Date: 2026-06-30
> Status: implemented

## 新增（Added）

- Core export service for Markdown daily diary export.
- Core redacted structured backup export endpoint.
- Settings Import / Export controls that call Core API and download returned artifacts.
- Export redaction for secret-like values in summaries, comments, document previews, and backup content.

## 修改（Changed）

- Settings privacy options now drive export behavior:
  - `redact_sensitive_values` keeps secret-like values redacted in exported content.
  - `include_comments_in_exports` controls whether comments are included by default.
- `MASTER.md` should mark Markdown export and redacted structured backup as implemented after verification.

## 移除（Removed）

- No raw SQLite database export is added in this slice.
- React UI still must not assemble export content from client state.

## 影響範圍（Impact）

- Affected modules: Core export service, Express routes, Settings API client, Settings UI, Core tests, root UI API tests, docs/test, MASTER.md.
- Security boundary: exports must not include raw DB dumps, unredacted `source_log_ref`, raw CLI transcript/log lines, credential file contents, or token-like secret values.

## 驗收條件

- [x] `GET /api/exports/daily?date=YYYY-MM-DD` returns Markdown with global summary, project summaries, token summary, sessions, and optional comments.
- [x] Markdown export uses user summary override before AI summary or fallback.
- [x] Comments are included only when export comments are enabled.
- [x] Markdown export omits cost fields, raw `source_log_ref`, raw transcript/log content, and secret-like values.
- [x] `GET /api/exports/backup` returns a redacted structured JSON bundle rather than a raw SQLite file.
- [x] Settings UI exposes Import / Export actions that call Core export endpoints and download returned artifacts.
- [x] Core tests, UI API tests, Core typecheck, root build, API smoke, and desktop/mobile Settings UI checks pass.
