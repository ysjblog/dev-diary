# Settings UI Core API Wiring

## Test Depth Route

- Level: 3
- Reason: Settings UI is a user-facing workflow that persists local path, privacy, appearance, scan policy, and agent enabled state through the Core API.
- Required verification: root settings API client tests, Core settings tests, Core typecheck, root build, localhost smoke, desktop/mobile RWD screenshots.
- Allowed skips: full component test harness is not present in the root React app; runtime browser smoke covers the rendered workflow.

## Bug Pattern Coverage

- [x] Input normalization / aliases / format variants: newline path lists are trimmed, empty lines are ignored, and canonical agent ids are preserved.
- [x] Boundary values / empty / null / malformed input: empty project roots are allowed as an empty array; scan interval is numeric and bounded by backend validation.
- [x] Rule priority conflicts: persisted settings override runtime defaults after reload.
- [x] Negation / exclusion / opt-out / unlimited: disabled agent and privacy opt-out values persist.
- [x] Contract generated and execution applied: UI PATCH payload matches `GET/PATCH /api/settings`, and Settings page renders the returned snapshot.
- [x] Operation order invariants: UI validates/normalizes before PATCH and applies returned server snapshot after save.
- [x] Production-like dirty data: path text with blank lines and duplicate values is normalized.
- [x] Multi-condition combinations: appearance, roots, scan interval, privacy, and agent toggles save together.
- [x] Security bypass mixed with normal input: path values are only sent as settings data; UI does not execute commands, read SQLite, or scan folders directly.
- [x] State/history/retry/refresh behavior: reload after save shows persisted settings.
- [x] Externally observable result, not only implementation detail: localhost browser smoke verifies visible Settings state and reload persistence.

## Runtime Verification Route

- Runtime smoke: REQUIRED
- Black-box QA: REQUIRED
- Safe environment or localhost command: Core on `127.0.0.1:4317` with a temp DB and Vite on localhost.
- Safe test account / mock access: no external account; local temp SQLite DB only.
- Forbidden or destructive actions: do not run configured paths, mutate project folders, read credentials, or hot-swap SQLite.

## [x] 【API Client】Settings snapshot loads and PATCH payload normalizes textarea values
**範例輸入**：Project roots textarea contains blank lines and repeated paths; Settings form changes appearance, scan interval, privacy, and one agent toggle.
**期待輸出**：`formToSettingsPatch` emits structured arrays, numeric `scan_interval_minutes`, privacy booleans, and `agents: [{ id, enabled }]` without executing any local path.

## [x] 【整合流程】Settings page loads from `GET /api/settings`
**範例輸入**：Open Settings page against local Core runtime.
**期待輸出**：Project Roots, Excluded Paths, Appearance, Scan Interval, Privacy, Data Storage, Scan Provider, and Agent toggles reflect the Core settings snapshot.

## [x] 【整合流程】Settings save persists through `PATCH /api/settings`
**範例輸入**：Change project roots, appearance, scan interval, privacy, and one agent enabled state; click save.
**期待輸出**：UI shows a successful save, returned settings are applied, and a fresh `GET /api/settings` returns the changed values.

## [x] 【狀態回歸】Reload keeps saved settings
**範例輸入**：Reload the browser after a successful save.
**期待輸出**：Settings page still displays the saved roots, appearance, interval, privacy, and agent enabled state.

## [x] 【RWD】Settings page remains usable on desktop and mobile widths
**範例輸入**：Open Settings page at desktop and mobile viewport sizes.
**期待輸出**：Rows collapse without overlapping text or controls; Save/Reload controls remain visible.

## [x] 【安全繞過】UI does not execute configured paths or read local storage directly
**範例輸入**：Enter a shell-looking path or command-looking string in Project Roots / Desired DB Path.
**期待輸出**：The value is treated as inert text sent to Core settings validation only; no browser-side file read, SQLite access, or command execution occurs.
