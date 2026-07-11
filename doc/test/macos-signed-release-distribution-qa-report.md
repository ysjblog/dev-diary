# QA Black-Box Report

- Environment: local macOS plus clean MacBook Air temp install from GitHub Release asset
- Revision: `bc0f094` (`fix(macos-release): bundle portable Node 22 runtime`)
- Timestamp: 2026-07-11 Asia/Taipei
- Test depth: Level 4
- Result: PASS for package, GitHub Release artifact, Finder metadata, clean-Mac Core health, CLI detection, and nested signatures

## Scenarios

- [PASS] Final DMG passes `hdiutil verify`, mounted app passes `codesign --verify --deep --strict`, and nested Mach-O files verify.
- [PASS] Quarantine diagnostic is rejected without sealed-resource, bundle-format, or invalid-signature errors.
- [PASS] Finder shows DevDiary, Applications shortcut, and drag-install background.
- [PASS] Fresh `/Applications/DevDiary.app` cold launch returns `ok: true` from `http://127.0.0.1:4317/api/health`.
- [PASS] Startup leaves `codesign --verify --deep --strict` valid and does not create `Contents/Resources/.launchagents`.
- [PASS] LaunchAgent source files are outside the bundle at `/Applications/.DevDiaryLaunchAgents`; the standard user LaunchAgents entry is a symlink and `launchctl print` resolves the new launcher.
- [PASS] GitHub Release asset on MacBook Air has SHA-256 `9a2aab89197a226715c48d3cbc310b387d8063f5c7083b37b4187a889b68452c`, valid DMG checksum, public bundle identifier, Node 22.23.1, and a valid app seal.
- [PASS] MacBook Air temp install launches Core with the bundled Node path and returns `ok: true` from `/api/health`; `/api/agents/detect` correctly reports the three absent CLI binaries as offline.

## Evidence

- Artifact: GitHub Release `v0.1.0`, asset size 88,564,309 bytes.
- Workflow: GitHub Actions run `29140716381`.
- Commands: frontend/Core/Rust tests, production builds, `npm run package:mac`, mounted verifier, release SHA/DMG/signature checks, and MacBook Air temp-install health/agent probes.

## Residual Risk

- This is valid ad-hoc signing, not Developer ID/notarization. Users must still use right-click Open or Privacy & Security manual approval.
