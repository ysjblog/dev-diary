# Delta: Workspace Write Paths Core API Wiring

> Feature: Projects Workspace 寫入路徑由 prototype local state 改接 Core API
> Base spec: `docs/specs/dev-diary-macos-app.md`（§5.3, §7.1.1, §11, §15.21）
> Branch: `feature/core-engine`
> Date: 2026-06-29
> Status: implemented

## 新增 (Added)

- Core write endpoints for selected-project Workspace actions:
  - `POST /api/projects/:id/comments`
  - `PATCH /api/projects/:id/comments/:commentId`
  - `DELETE /api/projects/:id/comments/:commentId`
  - `PATCH /api/projects/:id/kanban/:cardId`
  - `PUT /api/projects/:id/summary`
  - `POST /api/projects/:id/summary/regenerate`
  - `POST /api/projects/:id/summary/accept-draft`
- Project-scoped summary override/draft persistence in app data, used as an interim `DiaryEntry.markdown_user` / `markdown_ai` equivalent until the full DiaryEntry table lands.
- Core validation for comment content/tags, Kanban status enum, summary markdown length, project ownership, and ignored/missing project handling.
- UI API client helpers and Workspace handlers that refresh from the returned `ProjectDetailSnapshot` after writes.

## 修改 (Changed)

- Comments 新增 / 置頂 / 刪除不再只做 local optimistic state；成功寫入 Core 後刷新 snapshot。
- Kanban drag/drop 不再只改 local state；status change 持久化到 Core app data。
- Summary save writes a user override through Core and keeps it as the display/export-preferred value.
- AI regenerate creates a Core-owned AI draft and must not overwrite an existing user override unless the user explicitly accepts the draft.

## 移除 (Removed)

- Workspace comments / Kanban / summary handlers 的 prototype-only "本地暫存" 行為。

## 影響範圍（Impact）

- 受影響的模組：Core project services, Express local API, React Workspace API client, React Workspace handlers, tests, specs。
- MASTER.md 需更新的區塊：目前實作狀態、UI 接 Core API、已知 prototype-only 行為、delta 索引。

## 驗收條件

- [x] Comments can be added, pinned/unpinned, deleted, and remain after detail refetch.
- [x] Kanban drag/drop persists `todo` / `in_progress` / `done` status in app data only.
- [x] Summary save persists user markdown override and displays it after refetch.
- [x] AI regenerate creates an AI draft without overwriting user override; accept-draft is explicit.
- [x] Invalid id/body/status and cross-project comment/card ids do not mutate data.
- [x] Workspace writes do not modify project folders or Git state.
- [x] Core tests, typecheck, UI build, API smoke, and UI/RWD smoke pass.
