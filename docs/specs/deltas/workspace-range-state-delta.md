# Delta: Dashboard / Workspace Range State Split

> Feature: Projects Workspace selected-project range snapshot
> Base spec: `docs/specs/dev-diary-macos-app.md`（§11, §15.19, §15.20）
> Branch: `feature/core-engine`
> Date: 2026-06-29
> Status: implemented

## 新增 (Added)

- `ProjectDetailSnapshot` range metadata:
  - `range_key`
  - `start_date`
  - `end_date`
- `ProjectMetricStrip` selected-range metrics:
  - `range_token_total`
  - `range_session_count`
- `GET /api/projects/:id` now accepts the same range query contract as Dashboard:
  - `range=all|24h|7d|1m|custom`
  - `start=YYYY-MM-DD`
  - `end=YYYY-MM-DD`
- Workspace write endpoints accept the same optional range query and return a refreshed `ProjectDetailSnapshot` for that selected range.
- React Workspace range selector now supports `all`, `24h`, `7d`, `1m`, and `custom`, independent from Dashboard range state.
- `doc/test/workspace-range-state.md` records Level 3 coverage and smoke criteria.

## 修改 (Changed)

- `getProjectDetail` validates and canonicalizes the selected-project range before persisted queries.
- Workspace selected range now filters:
  - metric strip selected-range token/session cards
  - Token Detail rows and agent/model breakdowns
  - Sessions list
  - diary block candidates
- Dashboard and Workspace no longer share `timeRange`, custom dates, or date picker open state.
- Workspace diary exact-date and keyword filters apply on top of the ranged Core snapshot candidates.

## 移除 (Removed)

- Removed the prototype behavior where Workspace custom range reused Dashboard range state.
- Removed the prototype behavior where Workspace range only affected a local metric estimate.

## 影響範圍（Impact）

- 受影響的模組：Core project services, Express local API, React Workspace API client, React range state/rendering, tests, specs。
- MASTER.md 需更新的區塊：目前實作狀態、已知 prototype-only 行為、變更歷史、Data Contracts / Workspace 現況。

## 驗收條件

- [x] Dashboard range changes only Dashboard snapshot-driven charts/cards.
- [x] Workspace range changes only selected-project detail snapshot sections.
- [x] Workspace selected range filters metric strip selected cards, Token Detail rows, Sessions, and diary candidates together.
- [x] Custom reversed dates canonicalize to forward dates.
- [x] Empty future range returns zero/empty selected-project rows instead of all-time fallback.
- [x] Invalid Workspace range query returns 400.
- [x] Workspace writes preserve the selected range in their returned refreshed snapshot.
