# Technical Design: Remove DevDiary mobile RWD layout

## 中文摘要

本 Change 採 CSS-only、desktop-first 的最小方案：移除 `src/index.css` 三段窄 viewport media-query，讓現有 `.mac-window` desktop DOM 在所有 viewport 保持同一組 layout 規則。`src/App.jsx` 不增加 viewport 判斷、不建立 notice、不改 Core/API；窄螢幕的 overflow 是明確的 unsupported boundary，回復時只需還原這個 CSS patch。

## Context

- `src/App.jsx` renders one `.mac-window` shell containing the sidebar and page content; it does not contain a separate mobile navigation, notice, or mobile workspace branch.
- `src/index.css` defines the base desktop composition and three narrow-viewport blocks at 1180px, 820px, and 640px. Those blocks change shell size/padding, sidebar width and labels, Workspace from dual-panel to stacked layout, Dashboard grid columns, and Settings/control stacking.
- `src/api/appShell.test.js` already reads `App.jsx` and `index.css` as source-level app-shell contracts and is the smallest existing test surface for this change.
- The handoff's earlier UI evidence is earlier-only; it supports the problem statement but does not prove this new CSS state. Fresh browser evidence belongs to later Verify-QA.

## Goals / Non-Goals

### Goals

- Remove every mobile-specific max-width layout block from `src/index.css`.
- Preserve the existing desktop DOM, Core-backed routes, data boundary, and interactions.
- Make the unsupported narrow viewport behavior explicit in the Delta Spec and regression tests without adding a replacement UI.
- Keep the patch isolated from the existing scheduler/scan working change.

### Non-Goals

- No JavaScript viewport detection, React conditional rendering, accessibility notice, or mobile control set.
- No change to Core, API, SQLite, scheduler, scan, export, project, diary, or settings contracts.
- No broad removal of desktop-safe fluid sizing such as dialog max-width constraints unless it is part of one of the three mobile layout blocks.

## Runtime Path and Data Flow

1. The browser loads the unchanged `src/App.jsx` component tree and its existing Core-backed data loaders.
2. The browser applies the base rules in `src/index.css`; the three max-width overrides are absent, so the desktop sidebar, page grids, Workspace split, and Settings layout are not replaced by mobile rules.
3. At 768px and wider, the existing desktop workspace remains the supported presentation.
4. Below 768px, the same desktop DOM remains present but the viewport is outside the supported presentation boundary; no notice or app-owned data substitution is mounted, and no Core action is triggered by rendering.

## Decisions

### D1: Remove breakpoint blocks instead of adding a viewport gate

Delete the three mobile-specific `@media` blocks from `src/index.css` and keep the existing `App` render path unchanged.

**Rationale:** The user requested desktop-only support and explicitly excluded a narrow-screen substitute notice or mobile interaction flow. A CSS-only removal is the smallest reversible change and avoids introducing a second source of truth between React and CSS.

**Alternative rejected:** Add a `matchMedia` guard and notice below 768px. That would be a new narrow-screen UI and is outside the approved product behavior.

### D2: Treat 768px as the documentation/test boundary, not a new runtime branch

Use 768 CSS pixels as the binary acceptance boundary for supported desktop evidence. Do not encode it as a JavaScript condition or add a new CSS breakpoint.

**Rationale:** The existing narrow rules include 820px and 640px, while the requested outcome is removal of mobile RWD, not a new responsive threshold. A documented test boundary gives QA a repeatable viewport without creating another mobile layout rule.

### D3: Keep existing non-breakpoint sizing constraints

Do not mechanically remove unrelated `min-width`, `max-width`, `calc(100vw - ...)`, or modal bounds in the base stylesheet. Only rules whose purpose is the three mobile layout blocks are in scope.

**Rationale:** Those base constraints protect desktop webview and dialog usability; removing them would broaden the change without supporting the user's desktop-only decision.

## Contract Inventory

| Surface | Current contract | Planned change |
|---|---|---|
| `src/App.jsx` `.mac-window` tree | One desktop workspace tree is always rendered; no mobile branch | No change; remains the only render path. |
| `src/index.css` `@media (max-width: 1180px)` | Resizes shell and stacks/reshapes several desktop panels | Remove the full mobile layout block. |
| `src/index.css` `@media (max-width: 820px)` | Narrows sidebar, hides labels, stacks Workspace and Dashboard/Settings layouts | Remove the full mobile layout block. |
| `src/index.css` `@media (max-width: 640px)` | Shrinks sidebar, hides footer, collapses grids and action rows | Remove the full mobile layout block. |
| `src/api/appShell.test.js` | Existing source-level shell invariants | Add absence checks for max-width mobile blocks and mobile notice/branch markers. |
| Core loopback routes and app-owned data | Existing scan, scheduler, project, diary, Settings and export contracts | No change. |

## Execution Order and Failure Recovery

- First add/update the focused source-level contract test in `src/api/appShell.test.js` after Spec acceptance and before deleting CSS, so the test fails against the current three-breakpoint state.
- Remove only the three bounded media-query blocks from `src/index.css`; do not touch existing scheduler/scan WIP or unrelated style rules.
- Run the focused app-shell test, the full UI/API test suite, Vite build, and `git diff --check`.
- Run fresh browser checks at a supported desktop width (at least 768px) and a 390px narrow width. The narrow check verifies the absence of a mobile-specific rearrangement/notice; it is not evidence that narrow use is supported.
- If a test or build fails, revert only this Change's CSS/test patch or repair within the same Execute responsibility; no Core/API recovery or data migration is needed.

## Security and Privacy

This is a presentation-only change. It adds no inputs, routes, persistence, credentials, local-path output, project data, or logging. The existing React/Core trust boundary and read-only project access remain unchanged. The unsupported narrow viewport must not introduce a new data-bearing notice or expose new app-owned values.

## Migration and Rollback

No migration or backfill is required. Existing persisted settings and project data remain untouched. Rollback is a bounded restoration of the three removed CSS blocks before archive; it does not require database, Core, or API changes.

## Risks / Trade-offs

- **Narrow viewport may overflow or clip desktop content** → document it as unsupported and verify that no mobile layout promise remains.
- **A future contributor may reintroduce one breakpoint** → keep the app-shell test asserting the absence of all max-width mobile layout blocks and update the Change/Feature Spec together if the product decision changes.
- **Existing scheduler Change overlaps in draft spec scope** → leave its files untouched and require Spec Review to record ownership before Execute.

## Open Questions

None.
