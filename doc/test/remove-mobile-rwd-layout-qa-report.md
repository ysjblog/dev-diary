# QA Black-Box Report

- Environment: local DevDiary Vite UI at `http://127.0.0.1:5188` with an isolated Core API at `http://127.0.0.1:4317` (`DEVDIARY_DB=:memory:`, mock scan provider); no user SQLite or CLI-log data was used.
- Revision / HEAD SHA: `ad7fe548376c64615281d7b952aab34068576e5c`
- Timestamp: 2026-07-26T08:47:28+08:00
- Target URL / public entry: `http://127.0.0.1:5188/`
- Test depth: Level 3 — required runtime smoke and independent black-box QA
- Phase task / thread: `0190abcd-ef00-7000-8000-000000000012` / Verify-QA
- Independence method: a dedicated Verify-QA task used fresh Playwright browser sessions and did not modify product source.
- Bounded lens used: none
- Result: PASS

## Scenarios

- [PASS] At 1440 × 960 CSS pixels, DevDiary loads its desktop dashboard with the existing sidebar navigation, Dashboard, data cards, and `Scan Now` control still mounted. The local Core-backed requests for dashboard, projects, settings, health, agents, and scheduler returned HTTP 200; the fresh browser console had no errors.
- [PASS] At 390 × 844 CSS pixels, the same desktop DOM remains mounted: sidebar navigation, Dashboard, desktop data cards, and `Scan Now` remain present. No mobile replacement screen, narrow-screen notice, mobile-only controls, or mobile workflow was observed.
- [PASS] The 390px view clips/overflows the desktop composition behind the existing setup dialog rather than rearranging it into a phone layout. This is the intentional unsupported narrow-viewport boundary; it is not a claim of mobile support.

## Evidence

- Screenshots:
  - Desktop: `.playwright-cli/page-2026-07-26T08-47-05-608Z.png` (1440 × 960)
  - Narrow: `.playwright-cli/page-2026-07-26T08-47-28-961Z.png` (390 × 844)
  - UI hook copy: `/tmp/codex-ui-shot-df89aa9b86f2.png`
- Commands / artifacts: Playwright `open`, `resize`, `snapshot`, `screenshot`, `console error`, and `requests`; `GET /api/health` reported Core contract version 5 on loopback port 4317.
- Console errors: none in either fresh QA browser session after the isolated Core was started.
- Network/API errors: none in either fresh QA browser session; observed read endpoints returned HTTP 200. The initial inherited localhost target on port 5188 was stale, and port 5173 was an unrelated EVision app; neither was used as QA evidence.

## Findings

- Severity: none
- Reproduction steps: not applicable
- Expected: not applicable
- Actual: not applicable

## Residual Risk

This proves the desktop-only UI and existing local Core route contract using disposable in-memory/mock data. It does not prove real user SQLite contents, actual CLI-log scans, packaged Tauri behavior, production, or mobile support. The 390px result is intentionally unsupported presentation space.
