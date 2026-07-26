# Delta Spec: Remove DevDiary mobile RWD layout / dev-diary-macos-app

## 中文摘要

這是相對於現行 `dev-diary-macos-app` Feature Spec 的差異規格，不是完整現行規格。本 Change 把 UI 的支援邊界改為 desktop-only：移除窄 viewport 的 CSS 重新排版，不提供 mobile notice、mobile markup 或手機互動流程；既有 desktop workspace 與 Core-backed 行為維持不變。

## Baseline

- Capability: `dev-diary-macos-app`
- Current Feature Spec: `openspec/specs/dev-diary-macos-app/spec.md`
- Change: `remove-mobile-rwd-layout`

## ADDED Requirements

### Requirement: Desktop-only presentation boundary

The system SHALL present the existing desktop workspace as the only supported UI composition. It SHALL NOT define mobile-specific layout breakpoints or alternate mobile markup for the sidebar, Dashboard, Projects Workspace, Agents, Settings, dialogs, or their controls. A layout viewport narrower than 768 CSS pixels is unsupported presentation space: the existing desktop workspace may remain mounted and may overflow, but the UI SHALL NOT present a mobile-specific replacement, a narrow-screen notice, or a claim that the mobile viewport is supported. At 768 CSS pixels and wider, the existing desktop workspace SHALL remain available with its existing navigation, data-backed views, and actions.

#### Scenario: Narrow viewport does not receive a mobile layout

- **WHEN** the app is rendered in a 390 CSS-pixel-wide layout viewport
- **THEN** it does not apply mobile-specific breakpoint rules, does not mount alternate mobile markup or a narrow-screen notice, and does not claim that the viewport is a supported mobile workspace.

#### Scenario: Desktop viewport keeps the existing workspace

- **WHEN** the layout viewport is 768 CSS pixels wide or wider
- **THEN** the existing `.mac-window` desktop workspace, navigation, Dashboard, Projects Workspace, Agents, Settings, dialogs, and actionable controls remain available without a mobile-specific branch.

#### Scenario: Removing RWD rules does not change Core-backed behavior

- **WHEN** the user uses the supported desktop viewport after the CSS change
- **THEN** existing Core-backed scan, scheduler status, project, diary, settings, export, and read-only Git interactions retain their current routes and data boundary.

## Impacted Readers and Writers

- Writer: `src/index.css`, specifically the three existing `@media (max-width: 1180px)`, `@media (max-width: 820px)`, and `@media (max-width: 640px)` layout blocks.
- Reader: the browser CSS cascade for `body`, `.mac-window`, `.sidebar`, `.workspace-layout`, `.workspace-left`, `.workspace-right`, `.page-header`, `.dashboard-grid`, `.proj-metric-strip`, Settings layouts, and related child controls.
- Existing markup reader: `src/App.jsx`, whose single `.mac-window` tree remains the desktop workspace and has no mobile-only branch.
- Regression reader: `src/api/appShell.test.js`, which will assert the desktop-only source contract.
- Core/API readers and writers: none; existing loopback API and app-owned data boundaries are outside this Change.

## Compatibility and Migration

No data or API migration is required. Existing desktop users retain the same DOM, routes, settings, scan, scheduler, diary, export, and project interactions. Narrow viewport users lose the current responsive rearrangement and should use the desktop app window; no user data is deleted or transformed. Rollback is a reversible restoration of the removed CSS blocks before archive.

## Verification Mapping

| Requirement | Test / evidence change |
|---|---|
| Desktop-only presentation boundary | Update `src/api/appShell.test.js` to assert that no `@media (max-width: ...)` mobile layout blocks or alternate mobile notice/branch exist; later fresh browser evidence at 390px and at least 768px confirms unsupported narrow presentation and retained desktop workspace. |
| Removing RWD rules does not change Core-backed behavior | Existing UI/API contract tests plus desktop smoke of scan/status, Workspace, diary, Settings, and export paths; no Core or API implementation change is expected. |

## Open Questions

None.
