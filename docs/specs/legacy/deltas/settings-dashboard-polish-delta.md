# Delta Spec: Settings And Dashboard Polish

> PR: feature/core-engine
> Date: 2026-06-29
> Status: implemented

## 新增（Added）

- Dashboard trend axis metadata for readable y-axis token labels and x-axis date labels.
- Agent Token legend token count display next to each agent percentage.
- Range-based Dashboard project concentration ranking contract (`project_concentration`) with project token share and session count for the selected Dashboard range.
- Light-mode workspace session excerpt styling.

## 修改（Changed）

- App-facing Settings scan policy is fixed to real CLI logs with no fake fallback.
- Settings UI no longer exposes Mock provider or Mock fallback controls.
- Stored mock scan policy values are sanitized to `cli-logs` / `none` when read by Settings.
- Heatmap cells are visually better proportioned to the panel.
- Trend chart is taller and uses smooth curves instead of angular line segments.
- Heatmap calendar now renders a bounded latest-26-week window so the visible cell count remains stable as historical data grows.
- Trend chart axis labels use the app UI font, remain inside the chart bounds, and trend strokes use non-scaling stroke width.
- Trend chart total series uses a distinct amber color, and every visible series renders a same-color translucent area fill.
- Agent Token donut is visually larger while the center total label is smaller to leave room for larger formatted totals.
- Agent Token donut now renders filled SVG slices instead of stacked dashed circles to avoid range-dependent seam artifacts.
- Primary Agent / CLI Agents icons now use a non-robot sparkle agent glyph instead of lock imagery.
- Project concentration ranking follows the Dashboard time-range selector instead of using all-time `/api/projects` totals.
- Activity heatmap remains a latest-activity 26-week view independent from the Dashboard time-range selector.
- Activity heatmap uses one blue intensity scale only; dominant agent color variants were removed so the legend matches every cell.

## 移除（Removed）

- Removed the Settings UI options that could save Mock provider or Mock fallback into app settings.
- Removed the duplicated Settings `Agent Enabled State` toggle block; canonical agent enable/disable remains available from the CLI Agents page.

## 影響範圍（Impact）

- Affected modules: Settings backend, Settings UI adapter, Dashboard API adapter, TrendChart, Dashboard/Workspace CSS, tests, docs.
- Low-level deterministic mock scan provider remains available only for tests or direct provider injection; the app-facing Settings flow no longer exposes or persists it.
- No agent executable is invoked; scan remains read-only over existing local logs/metadata.

## 驗收條件

- [x] `GET /api/settings` returns `cli-logs` / `none` for app-facing scan policy.
- [x] `PATCH /api/settings` rejects mock scan policy values.
- [x] Settings UI does not display Scan Provider Policy when no mock data mode is available.
- [x] Dashboard trend chart renders axis labels and Agent Token legend renders token counts.
- [x] Dashboard replaces duplicate CLI ratio panel with project concentration ranking.
- [x] Project concentration ranking changes with the Dashboard time-range selector; percentages mean selected-range project token share.
- [x] Trend chart uses smoother curves, bounded labels, uniform non-scaling line strokes, and colored translucent area fills.
- [x] Total and Antigravity trend series use distinct colors.
- [x] Agent Token donut keeps large totals readable.
- [x] Agent Token donut segment seams stay stable across all-time, 1m, and custom ranges.
- [x] Agent icons are not lock or robot icons.
- [x] Settings does not duplicate agent enable toggles.
- [x] Heatmap renders a bounded latest-26-week calendar window and remains responsive.
- [x] Heatmap does not change when Dashboard time range changes.
- [x] Heatmap legend and cells use the same blue Low-to-High scale.
- [x] Heatmap and light-mode session list pass desktop/mobile visual smoke.
- [x] Core tests, root tests, Core typecheck, root build, and `git diff --check` pass.
