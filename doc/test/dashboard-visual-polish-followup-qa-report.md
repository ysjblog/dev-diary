# QA Black-Box Report

- Environment: local Core `http://127.0.0.1:4317` + Vite `http://localhost:5173`
- Revision / HEAD SHA: `1be03d8` plus working-tree changes
- Timestamp: `2026-06-29T16:53:30Z`
- Target URL / public entry: `http://localhost:5173`
- Test depth: Level 3
- Subagent attempt: not used
- Subagents used: none
- Fallback reason: available subagent tool is restricted to user-explicit delegation; user did not request subagents.
- Result: PASS

## Scenarios

- [PASS] Open Dashboard on desktop. Expected: page identity is DevDiary Dashboard, no blank page, no Vite/framework overlay, no console error/warn. Actual: URL `http://localhost:5173/`, title `DevDiary — AI Coding Cockpit`, Dashboard text present, console clean.
- [PASS] Verify all-time project concentration. Expected: ranking panel is not empty. Actual: 5 rows rendered, led by `Veggie finder` at `51.1%`.
- [PASS] Switch to `近1個月`. Expected: project ranking changes but heatmap active cells stay stable. Actual: ranking changed to 1m values; heatmap stayed at 182 cells / 62 active / 0 purple cells.
- [PASS] Verify custom/future range through API contract. Expected: selected-range metrics can be empty while heatmap remains latest activity. Actual: `range=custom&start=2030-01-01&end=2030-01-07` returned `token_total=0`, `project_concentration=0`, `heatmap_len=76`, `active_heatmap=62`.
- [PASS] Verify donut seam rendering. Expected: Codex/Claude seam has no visible spike, overlap, or odd purple-green artifact. Actual: desktop and mobile screenshots show stable donut slices.
- [PASS] Verify heatmap title and color semantics. Expected: shorter title, no purple cells, Low-to-High legend matches cell color scale. Actual: title is `AI 活躍熱力圖`; Browser DOM reported `purple=0`.
- [PASS] Mobile viewport smoke. Expected: no overlay/console errors; donut, ranking, and heatmap render without overlap. Actual: mobile first viewport and scrolled heatmap screenshot passed, console clean.

## Evidence

- Screenshots:
  - `/tmp/devdiary-dashboard-polish-desktop-clean.png`
  - `/tmp/devdiary-dashboard-polish-mobile.png`
  - `/tmp/devdiary-dashboard-polish-mobile-heatmap.png`
  - Hook screenshot copy: `/tmp/codex-ui-shot-df89aa9b86f2.png`
- Commands / artifacts:
  - `npm test`
  - `npm run build`
  - `cd core && npm test`
  - `cd core && npm run typecheck`
  - `git diff --check`
  - Browser DOM checks for ranking rows, donut paths, axis font, heatmap cell classes, desktop/mobile screenshots
- Console errors: none observed
- Network/API errors: none observed after Core restart

## Findings

- None.

## Residual Risk

- Browser automation could not make React accept `input[type=date]` changes through the visual date picker, so custom-date UI state was verified by API contract and popover rendering rather than a full end-to-end date input state transition.
