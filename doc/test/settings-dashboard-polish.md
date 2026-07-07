# Settings And Dashboard Polish

## Test Depth Route

- Level: 3
- Reason: This changes app-facing settings validation, scan provider policy, dashboard chart rendering, token mix display, and responsive/light-mode UI.
- Required verification: Core settings/dashboard tests, root API tests, Core typecheck, root build, browser desktop/mobile smoke, Settings page smoke, and `git diff --check`.
- Allowed skips: no direct agent CLI execution; no production deployment.

## Bug Pattern Coverage

- [x] Input normalization / aliases / format variants: app-facing Settings rejects or sanitizes mock scan policy values.
- [x] Boundary values / empty / null / malformed input: trend axis handles empty/one-point/all-zero data; heatmap caps the visible window at 26 weeks; donut center label remains compact for large formatted totals.
- [x] Rule priority conflicts: persisted mock policy does not override real-log-only Settings defaults.
- [x] Negation / exclusion / opt-out / unlimited: no scan fallback means no fake records are written when no CLI logs are found.
- [x] Contract generated and execution applied: Dashboard snapshot exposes range-based `project_concentration`, view model maps it, and Dashboard renders the selected-range ranking.
- [x] Operation order invariants: Settings validates before persisting; UI patches only app-facing settings fields.
- [x] Production-like dirty data: old persisted mock values do not crash `GET /api/settings`.
- [x] Multi-condition combinations: light mode + workspace sessions remains readable; Dashboard agent colors remain distinguishable.
- [x] Security bypass mixed with normal input: configured paths remain data only; no configured command is executed.
- [x] State/history/retry/refresh behavior: reload preserves real-log-only policy; Dashboard range changes update ranking data.
- [x] Externally observable result, not only implementation detail: Settings no longer shows Mock controls, Scan Provider Policy, or duplicated Agent Enabled State; Dashboard shows bounded chart labels, project ranking, area-filled trend chart, and 26-week heatmap.

## Runtime Verification Route

- Runtime smoke: REQUIRED
- Black-box QA: REQUIRED
- Safe environment or localhost command: Existing local Core `http://127.0.0.1:4317` and Vite UI `http://127.0.0.1:5173`.
- Safe test account / mock access: local machine only; no external account; no agent executable invocation.
- Forbidden or destructive actions: do not execute Codex/Claude/Antigravity commands, do not write project folders, do not print secrets.

## [x] 【function 邏輯】Settings no longer accepts app-facing mock scan policy
**範例輸入**：`PATCH /api/settings` with `scan_provider: { provider: "mock", fallback: "mock" }`.
**期待輸出**：Core returns a validation error; default and saved app-facing policy remains `cli-logs` / `none`.

## [x] 【function 邏輯】Old persisted mock policy is sanitized on read
**範例輸入**：Existing `app_settings` row contains `scan_provider` set to `mock`.
**期待輸出**：`GET /api/settings` returns `scan_provider: { provider: "cli-logs", fallback: "none" }` instead of crashing or exposing mock.

## [x] 【function 邏輯】Dashboard view model carries token counts and trend axis metadata
**範例輸入**：Dashboard snapshot has per-agent token totals and trend buckets.
**期待輸出**：Agent legend rows include formatted token counts; trend axis exposes readable y-axis labels and date labels.

## [x] 【前端元素】Settings scan policy shows real logs only
**範例輸入**：Open Settings page.
**期待輸出**：No Mock provider or Mock fallback select is visible; user sees real CLI logs / no fake fallback wording.

## [x] 【前端元素】Dashboard chart and heatmap polish
**範例輸入**：Open Dashboard with current real DB data.
**期待輸出**：Trend chart has vertical and horizontal axis labels; heatmap cells scale larger without overflow; Agent Token legend shows percent and token quantity.

## [x] 【前端元素】Dashboard replaces duplicate CLI ratio card with project concentration
**範例輸入**：Open Dashboard with current real DB project list.
**期待輸出**：The former CLI call ratio panel is replaced by a Top Projects concentration ranking with project share, token count, and session count.

## [x] 【前端元素】Trend and heatmap scale comfortably
**範例輸入**：Open Dashboard on desktop and mobile widths.
**期待輸出**：Trend chart is taller with smooth curves; heatmap cells scale to about 19px on desktop and about 15px on mobile without overflow.

## [x] 【RWD】Light mode workspace sessions remain readable
**範例輸入**：Switch to light mode, open a project Workspace, select Sessions tab.
**期待輸出**：Session excerpt panels have readable foreground/background contrast on desktop and mobile.

## [x] 【整合流程】Project concentration follows the selected Dashboard range
**範例輸入**：Fetch Dashboard snapshots for `all` and `7d`.
**期待輸出**：`project_concentration` uses the same selected range as metric/agent mix, each percentage means the project share of selected-range token total, and session counts are selected-range sessions.

## [x] 【資料邊界】Heatmap keeps a bounded visible week window
**範例輸入**：Build a heatmap calendar from more than 26 weeks of daily cells.
**期待輸出**：The calendar renders only the latest 26 week columns while preserving square cells and deterministic month labels.

## [x] 【前端元素】Settings hides Scan Provider Policy when mock data is unavailable
**範例輸入**：Open Settings page.
**期待輸出**：The Scan Provider Policy row is not visible; mock provider/fallback is not exposed in app-facing Settings.

## [x] 【前端元素】Trend chart uses readable bounded labels and uniform stroke width
**範例輸入**：Open Dashboard and inspect the token trend chart.
**期待輸出**：Axis labels stay inside the chart panel, use the same UI font as surrounding text, and lines keep a uniform visual stroke while the chart uses more of the panel height.

## [x] 【前端元素】Trend chart uses colored translucent area fills
**範例輸入**：Open Dashboard with all trend series visible.
**期待輸出**：Each visible trend line renders a low-opacity filled area using the same series color, and the total series color is visually distinct from Antigravity.

## [x] 【前端元素】Agent token donut keeps large totals readable
**範例輸入**：Open Dashboard with million-scale token totals.
**期待輸出**：The donut ring is larger while center total text is smaller and does not crowd the ring.

## [x] 【前端元素】Agent icons are not lock or robot icons
**範例輸入**：Open Dashboard and sidebar.
**期待輸出**：Primary Agent and CLI Agents navigation use an AI-agent-like non-robot icon, not a lock.

## [x] 【前端元素】Settings does not duplicate agent enable toggles
**範例輸入**：Open Settings and CLI Agents pages.
**期待輸出**：Settings no longer shows `Agent Enabled State`; canonical agent enable/disable remains available in CLI Agents.
