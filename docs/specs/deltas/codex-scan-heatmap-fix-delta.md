# Delta Spec: Codex Scan Tokens And Heatmap Calendar Fix

> PR: feature/core-engine
> Date: 2026-06-29
> Status: implemented

## 新增（Added）

- Codex parser support for Codex JSONL token metadata under `payload.info.last_token_usage` and `payload.info.total_token_usage`.
- Frontend heatmap calendar mapper that positions cells by Monday-start weekday rows and week columns.
- Dashboard API client tests for month labels and weekday/week positioning.

## 修改（Changed）

- Project list now derives `detected_agents` from persisted sessions in addition to the project row, so Codex/Antigravity activity is visible even when the stored `projects.detected_agents` JSON is stale.
- Dashboard heatmap rendering no longer hard-codes Jan-Jun month labels or relies on CSS grid auto-flow.
- Codex scan sessions with usage metadata now persist non-zero token fields for newly inserted sessions and can backfill same-source existing sessions by applying a positive token delta.

## 移除（Removed）

- Removed the prototype heatmap assumption that fixed 26 columns and hard-coded month labels can represent any returned range.

## 影響範圍（Impact）

- Affected modules: Codex CLI parser, project list aggregation, Dashboard API client, Dashboard heatmap rendering, tests, docs.
- Existing zero-token Codex sessions can be backfilled on a later scan when the source log now parses with a larger token total.
- No agent executable is invoked; scan still reads existing local logs/metadata only.
- React UI still consumes Core API snapshots and does not read local log files directly.

## 驗收條件

- [x] Codex parser reads token metadata from realistic Codex JSONL rows.
- [x] Project list shows agents derived from sessions when project `detected_agents` is empty.
- [x] Heatmap renders Monday-start weekday rows and dynamic month labels.
- [x] Core tests, root tests, Core typecheck, root build, and `git diff --check` pass.
- [x] Localhost browser/RWD smoke verifies heatmap layout has no obvious overlap.
