# QA Black-Box Report

- Environment: macOS local, Finder + Chromium, in-memory Core on `127.0.0.1:4320`
- Revision / HEAD SHA: working tree on `fd7ce78`
- Timestamp: 2026-07-11 23:04 Asia/Taipei
- Target URL / public entry: `http://localhost:5173/` and `src-tauri/target/release/bundle/dmg/DevDiary_0.1.0_aarch64.dmg`
- Test depth: Level 4
- Subagent attempt: yes
- Subagents used: sol
- Fallback reason: none
- Result: PASS

## Scenarios

- [PASS] Fresh final DMG read-only mount shows the custom `Install DevDiary` background, drag arrow, and only visible `DevDiary` / `Applications` install items.
- [PASS] Release verifier passes DMG checksum, Applications symlink, portable Finder metadata, nested Mach-O signatures, bundle seal, quarantine diagnostic, and Gatekeeper manual-approval expectation.
- [PASS] Real first-launch onboarding is visible through an in-memory Core; light primary normal contrast is 5.93:1 and hover contrast is 7.56:1. Foreground remains readable and hover background changes.
- [PASS] Desktop and 390×844 mobile onboarding have no horizontal overflow; the primary button remains inside the viewport.
- [PASS] Minimal packaged GUI PATH detects Codex at `/Applications/ChatGPT.app/Contents/Resources/codex` without shell execution.
- [PASS] A fixture project-root discovery returns the configured container root and its expected project directory, while ignored dependency folders remain excluded.

## Evidence

- Screenshots: `/tmp/codex-ui-shot-df89aa9b86f2.png`; fresh Finder screenshot captured through Computer Use; Playwright desktop/mobile screenshots captured during this run.
- Commands / artifacts: `npm run package:mac`; `scripts/verify-macos-release.sh ...dmg`; Core Vitest 186/186; UI Node tests 54/54; Core `tsc --noEmit`; Vite production build.
- Console errors: 0 in final independent onboarding QA.
- Network/API errors: 0 in final independent onboarding QA.

## Findings

- Severity: none open.
- Reproduction steps: n/a.
- Expected: n/a.
- Actual: n/a.

## Residual Risk

- Canonical agent binary paths still do not have a persisted manual picker; supported environment overrides remain available, and the macOS app-bundle fallback fixes this machine's automatic Codex detection.
- Release remains an ad-hoc manual-approval build rather than Developer ID notarized, matching the current product release contract.
