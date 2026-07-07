# Delta Spec: Local HTTP API runtime discovery and stale runtime detection
> PR: feature/core-engine
> Date: 2026-06-30
> Status: implemented

## 新增（Added）

- Core `/api/health` reports a local runtime identity payload:
  - `api_contract_version`
  - `port`
  - `pid`
  - `started_at`
  - `capabilities`
- Settings UI reads `/api/health` and shows the active Core runtime connection.
- Frontend API helpers translate route-level 404 into stale Core runtime guidance.

## 修改（Changed）

- Settings becomes the visible place to inspect which Core process the UI is connected to.
- `Run now` failures caused by an old Core route should no longer look like an Antigravity CLI failure.

## 移除（Removed）

- 不適用。

## 影響範圍（Impact）

- Core local HTTP API health contract.
- React Settings UI.
- Frontend API error handling.
- Runtime troubleshooting docs and tests.

## 驗收條件

- [x] `GET /api/health` returns runtime identity and capabilities without secrets.
- [x] Settings displays active Core API port / contract version / stale status.
- [x] Old Core health shape is classified as stale.
- [x] Route 404 errors show stale-runtime guidance.
- [x] Runtime smoke proves `localhost:5173` can reach current Core scheduler routes.
