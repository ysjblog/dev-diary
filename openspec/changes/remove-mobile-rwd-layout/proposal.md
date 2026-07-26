# Change Proposal: Remove DevDiary mobile RWD layout

## 中文摘要

DevDiary 改為明確的 desktop-only 介面：移除 `src/index.css` 目前在 1180、820 與 640 CSS pixels 以下重新排列 sidebar、Workspace、Dashboard、Settings 與 controls 的 mobile RWD 規則。保留既有 desktop workspace 與 `src/App.jsx` 的資料／互動結構，不新增手機提示、手機版 markup 或窄螢幕替代流程；窄 viewport 不再被宣稱為支援的 RWD 介面。

## Why

The current stylesheet contains three progressively narrower `@media (max-width: ...)` blocks. They compress the sidebar, stack the Projects Workspace, reshape Dashboard cards, and convert Settings controls into a mobile layout. Existing Verify-QA found that the desktop workspace still horizontally overflows at a phone viewport, so the responsive rules provide an inconsistent and unsupported product promise. The product decision is now to support the desktop interface only.

## What Changes

- Remove the mobile-specific `@media` layout rules from `src/index.css`.
- Keep the existing desktop workspace DOM, navigation, data reads, and actions unchanged in `src/App.jsx`.
- Define narrow viewports as unsupported presentation space; do not add a notice, mobile navigation, mobile controls, or a JavaScript viewport gate.
- Add source-level regression coverage and later fresh desktop/narrow browser evidence for the desktop-only contract.

## Scope

- The CSS cascade that changes layout below the current desktop breakpoints.
- App-shell contract tests that prove no mobile-specific breakpoint rules or alternate mobile markup are introduced.
- OpenSpec Change artifacts and the `docs/specs/MASTER.md` navigation entry.

## Non-Goals

- No Core, SQLite, scheduler, scan, export, API, authentication, or project-data changes.
- No new narrow-screen notice or mobile substitute workflow.
- No redesign of the desktop workspace, no removal of desktop interactions, and no unrelated cleanup of fluid sizing used by dialogs or the Tauri webview.
- No modification of the existing `fix-scan-status-and-daily-diary-scheduler` working change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `dev-diary-macos-app`: the supported presentation boundary changes to desktop-only and mobile RWD layout behavior is removed.

## Impact

- **UI:** `src/index.css` loses its three narrow-viewport layout overrides; `src/App.jsx` remains the desktop workspace entry point.
- **Tests:** `src/api/appShell.test.js` gains static contract checks for the absence of mobile breakpoint layout rules and alternate mobile branches.
- **Runtime/data:** no Core route, data model, persistence, scheduler, scan, export, or provider behavior changes.
- **Documentation:** the active Change is indexed in `docs/specs/MASTER.md`; current Feature Spec truth remains unchanged until a later approved implementation and archive.

## Risks

- Users opening the app in a narrow window may see the unchanged desktop composition with clipping or horizontal overflow; this is an intentional unsupported boundary and must be documented in acceptance evidence.
- Removing only some breakpoint rules could leave a partial mobile promise; the implementation task must remove all three mobile layout blocks and test their absence.
- The existing scheduler Change currently contains a related desktop-only draft requirement. This Change owns the CSS-only removal; the overlap must be reviewed explicitly before implementation, while the scheduler working tree remains untouched.

## Open Questions

None.
