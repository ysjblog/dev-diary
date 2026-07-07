# QA Black-Box Report

- Environment: Local Core `http://127.0.0.1:4317` with temp DB `/tmp/devdiary-settings-ui-smoke.sqlite`; Vite UI `http://127.0.0.1:5173`
- Revision / HEAD SHA: `01202be` plus working tree changes
- Timestamp: 2026-06-29 20:10 Asia/Taipei
- Target URL / public entry: `http://127.0.0.1:5173`
- Test depth: Level 3
- Subagent attempt: Skipped
- Subagents used: No
- Fallback reason: Available multi-agent tool policy says not to spawn subagents unless the user explicitly asks; main agent performed a separate black-box pass.
- Result: PASS

## Scenarios

- [PASS] Open Settings page after local runtime startup. Expected Settings page to render a Core settings snapshot. Actual page displayed Project Roots, Excluded Paths, Scan Interval, Scan Provider, Appearance, Privacy, Agent enabled state, and Data Storage path from `GET /api/settings`.
- [PASS] Change Settings through the visible UI and save. Expected `PATCH /api/settings` to return 200 and persist structured settings. Actual Network log showed `PATCH http://127.0.0.1:5173/api/settings => 200 OK`; direct Core GET returned the saved roots, excluded path, `appearance=dark`, `scan_interval_minutes=60`, privacy booleans, and `claude-code enabled=true`.
- [PASS] Reload browser and re-open Settings. Expected saved values to remain visible. Actual Settings page showed `/tmp/devdiary-settings-ui-browser`, `/tmp/devdiary-settings-ui-browser/node_modules`, one-hour interval, redaction enabled, comments export disabled, and Claude Code enabled.
- [PASS] Desktop RWD check. Expected no overlapping text or broken controls. Actual screenshot showed readable two-column settings layout.
- [PASS] Mobile RWD check. Expected rows to collapse and controls remain usable. Actual screenshot showed Settings rows stacked with full-width controls and no incoherent overlap.
- [PASS] Security behavior check. Expected UI to treat paths as inert text and never read SQLite, scan folders, or execute paths. Actual browser/API flow only performed `GET /api/settings` and `PATCH /api/settings`; no browser-side file, SQLite, or command execution occurred.

## Evidence

- Screenshots:
  - `output/playwright/settings-ui-desktop.png`
  - `output/playwright/settings-ui-mobile.png`
- Commands / artifacts:
  - `PATCH /api/settings => 200 OK`
  - Direct Core GET after save returned persisted Settings values.
- Console errors:
  - None after the selected-project initialization fix.
- Network/API errors:
  - None in the final Settings smoke. All visible API calls returned 200.

## Findings

- Severity: None.
- Reproduction steps: Not applicable.
- Expected: Not applicable.
- Actual: Not applicable.

## Residual Risk

- Root React app still uses CLI/browser smoke rather than a component test harness.
- Real agent detection / safe probe remains out of scope; only canonical `agents.enabled` settings are persisted.
