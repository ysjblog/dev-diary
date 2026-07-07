# Packaged Scan and Window Chrome Regression Tests

## Test Depth Route

- Level: 3
- Reason: Fixes cross-module Core scan behavior and user-visible packaged macOS chrome.
- Required verification: targeted parser/API tests, UI shell test, core typecheck, UI build, packaged runtime smoke, screenshot/RWD check.
- Allowed skips: signed/notarized package and OS-level scheduler are out of scope for this fix.

## Bug Pattern Coverage

- [x] Boundary values / empty / null / malformed input: malformed JSONL remains covered by existing parser tests.
- [x] Contract generated and execution applied: global scan must use the shared parsed CLI-log contract and return refreshed snapshots.
- [x] Operation order invariants: scan indexes logs before per-project persistence; UI removes fake controls before styling full-viewport shell.
- [x] Production-like dirty data: Codex log scan handles many unrelated files without reading the same index once per project.
- [x] State/history/retry/refresh behavior: repeated scan must not duplicate sessions and must not wedge the API.
- [x] Externally observable result, not only implementation detail: packaged app must expose healthy Core API, auto-scan configured roots after startup, and show no fake inner titlebar.
- [x] Security bypass mixed with normal input: local Core CORS must allow the Tauri webview and localhost dev origins without allowing arbitrary websites to read the API.
- [ ] Input normalization / aliases / format variants: not relevant; no new user-facing parser syntax.
- [ ] Rule priority conflicts: not relevant; no priority rules changed.
- [ ] Negation / exclusion / opt-out / unlimited: not relevant; no opt-out semantics changed.
- [ ] Multi-condition combinations: covered by global scan with multiple projects and mixed log sources.

## Runtime Verification Route

- Runtime smoke: REQUIRED
- Black-box QA: REQUIRED
- Safe environment or localhost command: packaged `DevDiary.app` against `127.0.0.1:4317`
- Safe test account / mock access: local-only SQLite and existing local CLI logs
- Forbidden or destructive actions: no project-folder writes, no secrets printed, no signed/notarized distribution

## [x] 【function 邏輯】Codex logs are indexed once per provider and reused across project scans
**範例輸入**：two projects, one shared Codex log tree, one global scan.
**期待輸出**：both project sessions are discovered without repeated full-tree reads.

## [x] 【Mock API】Global scan returns quickly with parsed records and refreshed snapshots
**範例輸入**：`POST /api/scan` with configured project roots and CLI-log provider.
**期待輸出**：HTTP 200 with `scan.status=success`, dashboard snapshot, and project list.

## [x] 【前端元素】Packaged UI does not render fake macOS traffic lights
**範例輸入**：rendered App shell source and CSS.
**期待輸出**：no `.window-controls` / `.control-dot` elements; `.mac-window` fills the webview without black outer padding.

## [x] 【整合流程】Packaged app scan/update smoke remains responsive
**範例輸入**：launch packaged `DevDiary.app`, call `/api/health`, `/api/dashboard`, and `POST /api/scan`.
**期待輸出**：Core answers health/dashboard and scan completes without wedging subsequent API calls.

## [x] 【整合流程】App startup recovers from Core launch race and auto-scans configured roots
**範例輸入**：open the packaged app with persisted `project_roots`, then load the React UI while Core is starting.
**期待輸出**：Settings/Dashboard recover from transient `Load failed`; UI sends one startup `POST /api/scan`; Settings shows connected Core and persisted roots.

## [x] 【RWD】Desktop and narrow viewport do not show an outer black frame
**範例輸入**：desktop screenshot and narrow viewport/browser screenshot.
**期待輸出**：content fills its viewport; only native macOS titlebar traffic lights remain in packaged app.

## [x] 【錯誤處理】Packaged Tauri webview can read the loopback Core API
**範例輸入**：`Origin: tauri://localhost` request to `GET /api/health` and preflight `OPTIONS /api/settings`.
**期待輸出**：Core replies with matching `Access-Control-Allow-Origin`, allowed methods/headers, and no `Load failed` in packaged UI.

## [x] 【安全繞過】Untrusted website origins cannot read local Core responses
**範例輸入**：`Origin: https://example.com` request to `GET /api/health`.
**期待輸出**：Core still serves local HTTP clients, but does not return `Access-Control-Allow-Origin` for the untrusted browser origin.
