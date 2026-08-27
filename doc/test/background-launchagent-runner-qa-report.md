# QA Black-Box Report

- Environment: installed DevDiary 0.1.4, macOS LaunchAgents, manifest-declared loopback Core and Ollama
- Revision / HEAD SHA: `2536edc314e6a2818fcd0ba7bbeef4fd960d3128` (workspace reference; installed-artifact binding is covered by Owner packaging evidence, not this independent read-only lens)
- Timestamp: 2026-08-28 01:12–01:14 Asia/Taipei
- Target URL / public entry: loopback Core API declared by the runtime manifest
- Test depth: Level 3 runtime smoke and independent black-box QA
- Owner / QA Worker identity: Owner `/root`; QA Worker `/root/installed_black_box_qa`
- Independence method: different no-fork read-only worker; GET and system/read-only SQLite inspection only
- Bounded lens used: installed artifact, Core API, LaunchAgents, local Ollama, SQLite, signatures, DMG, and leftover workers
- Result: PASS

## Scenarios

- [PASS] Installed App exists at version 0.1.4, the manifest owner process is live, and two fresh `GET /api/health` calls returned HTTP 200 in 3.1 ms and 3.8 ms. Manifest and health both reported API contract 6 with local-Ollama settings and project-reconciliation capabilities.
- [PASS] `GET /api/settings` returned HTTP 200 in 3.4 ms and `GET /api/scheduler/daily` in 6.2 ms. The daily schedule is enabled at 23:40 Asia/Taipei. The enabled default diary agent is a custom loopback Ollama provider using `qwen3:8b` with thinking disabled.
- [PASS] `com.ysjblog.devdiary.background` is registered and running. Its source is below `/Applications/.DevDiaryLaunchAgents`; the per-user registration is a symlink to that readable, plist-valid source and the launcher is executable. `com.ysjblog.devdiary.ollama` is registered, running, has a live PID, and is loopback-bound.
- [PASS] Read-only `GET /api/tags` returned HTTP 200 in 57.9 ms and confirmed `qwen3:8b` is installed. Independent QA did not invoke generation.
- [PASS] `sqlite3 -readonly` with `PRAGMA query_only=ON` returned `integrity_check=ok`. Aggregate counts were projects 29, sessions 1582, project summaries 29, project daily diaries 202, daily logs 46, scheduler runs 31, Kanban cards 795, comments 1, project docs 1759, token usage 562, scan cache 12471, reconciliation runs 1, app settings 2, and schema meta 1. No row content was read.
- [PASS] `codesign --verify --deep --strict` passed for the installed App in 0.575 seconds. `hdiutil verify` passed for the 0.1.4 arm64 DMG in 3.426 seconds.
- [PASS] No `manualScanWorker` process remained after the Owner smoke.

## Evidence

- Screenshots: independent QA did not start the graphical App. Owner separately captured and visually inspected the supported 1280x820 localhost UI after the runtime smoke.
- Commands / artifacts: read-only `curl GET`, `launchctl print`, `plutil -lint`, `sqlite3 -readonly`, `codesign --verify`, `hdiutil verify`, and `pgrep`.
- Console errors: none.
- Network/API errors: none; every tested GET returned HTTP 200.
- Write actions: none; QA issued no POST, PATCH, PUT, DELETE, scan, generation, or scheduler-run request.

## Findings

No reproducible product defect was found.

## Residual Risk

- Independent QA did not launch or interact with the graphical App; Owner's separate fresh Playwright desktop capture covers the current supported viewport.
- The package is an ad-hoc/manual-approval local build, so this QA does not claim Developer ID notarization or public Gatekeeper acceptance.
- This is a point-in-time check, not a long-duration LaunchAgent soak, restart, or reboot recovery test.
