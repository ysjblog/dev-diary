# Delta Spec: Workspace Active / Idle Session Window
> PR: feature/core-engine
> Date: 2026-07-06
> Status: implemented

## 新增（Added）

- Workspace project status read path derives `active` / `idle` from recent sessions.
- A project is `active` only when it has at least one session in the current 5-calendar-day window anchored to server `today`.

## 修改（Changed）

- `projects.tracking_status` remains a persisted storage field for backward compatibility, but Workspace API snapshots expose only derived `active` / `idle` status for list/detail consumers.
- Legacy rows with persisted `paused` are still derived from recent sessions and are not exposed as `paused` to the frontend.
- `last_activity_at` remains a sortable/display metadata field; session freshness is the status source of truth.

## 移除（Removed）

- No schema fields are removed.

## 影響範圍（Impact）

- Core Workspace list/detail APIs.
- React Workspace filters and badges through existing API mapper.
- Daily scheduler and Kanban synthesis project iteration, because they read Workspace project snapshots.

## 驗收條件

- [x] Project with latest session inside the current 5-day window is returned as `active`.
- [x] Project with no session in the current 5-day window is returned as `idle`.
- [x] Project with persisted `paused` is still returned as `active` or `idle` based on recent sessions.
- [x] `/api/projects` and `/api/projects/:id` expose the same derived status rule.
