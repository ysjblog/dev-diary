# Codex Scan Tokens And Heatmap Calendar Fix

## Test Depth Route

- Level: 3
- Reason: This changes CLI log parsing, persisted token aggregation visibility, project list agent detection, and a dashboard UI workflow.
- Required verification: Core parser/project/dashboard tests, root API client tests, Core typecheck, root build, live API smoke against the running local runtime, desktop/mobile browser screenshot after UI change.
- Allowed skips: no direct command execution or production external calls; black-box QA may be main-agent because subagents are not user-requested in this environment.

## Bug Pattern Coverage

- [x] Input normalization / aliases / format variants: Codex usage supports `reasoning_output_tokens` and canonical agent ids from sessions.
- [x] Boundary values / empty / null / malformed input: sessions without usage still parse as low-confidence zero-token sessions.
- [x] Rule priority conflicts: `total_token_usage` wins as final cumulative total, avoiding repeated sum inflation.
- [x] Negation / exclusion / opt-out / unlimited: no change.
- [x] Contract generated and execution applied: parsed Codex tokens flow into `sessions`, `token_usage`, dashboard mix, and project list agent tags.
- [x] Operation order invariants: parser reads logs read-only; scan inserts or updates sessions idempotently by `source_log_ref`.
- [x] Production-like dirty data: real Codex JSONL shape uses `payload.info.last_token_usage` / `total_token_usage`.
- [x] Multi-condition combinations: zero-token Antigravity sessions still count in heatmap while token-bearing Claude/Codex drive token mix.
- [x] Security bypass mixed with normal input: no configured path or CLI command is executed; raw prompts/responses remain unpersisted.
- [x] State/history/retry/refresh behavior: repeated scan does not duplicate existing sessions and only applies positive token deltas.
- [x] Externally observable result, not only implementation detail: dashboard heatmap and project list reflect parsed sessions.

## Runtime Verification Route

- Runtime smoke: REQUIRED
- Black-box QA: REQUIRED
- Safe environment or localhost command: Existing local Core `http://127.0.0.1:4317` and Vite UI `http://127.0.0.1:5173`.
- Safe test account / mock access: local machine only; no external account.
- Forbidden or destructive actions: do not execute Codex/Antigravity/Claude CLI commands, do not write project folders, do not print raw prompts or secrets.

## [x] 【function 邏輯】Codex parser reads token usage from Codex JSONL metadata
**範例輸入**：Codex JSONL rows include `payload.info.last_token_usage` and `payload.info.total_token_usage`.
**期待輸出**：Parsed `codex-cli` session has non-zero input/cached/output/reasoning totals and `parser_confidence = 0.85`.

## [x] 【function 邏輯】Project list derives detected agents from sessions
**範例輸入**：`projects.detected_agents = []` but the project has a `codex-cli` session.
**期待輸出**：`GET /api/projects` list item includes `codex-cli` in `detected_agents`.

## [x] 【前端元素】Heatmap lays out dates by week column and weekday row
**範例輸入**：Activity dates from `2026-04-15` through `2026-06-29`.
**期待輸出**：Columns are weeks, rows are Monday through Sunday; `2026-04-15` is Wednesday in the first visible week, and month labels appear over Apr/May/Jun boundaries.

## [x] 【整合流程】Live scan result can show Codex after re-scan
**範例輸入**：Run `POST /api/scan?range=all` against local persistent runtime after parser fix.
**期待輸出**：New/unparsed Codex sessions persist with non-zero tokens when source logs contain usage metadata; existing same-source zero-token Codex sessions can be backfilled by applying a positive token delta.

## [x] 【RWD】Dashboard heatmap remains readable on desktop and mobile
**範例輸入**：Open dashboard at desktop and mobile widths after heatmap layout change.
**期待輸出**：No overlapping month labels, weekday labels, or heatmap cells.
