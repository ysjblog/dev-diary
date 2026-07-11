# QA Black-Box Report

- Environment: local macOS, final DMG installed at `/Applications/DevDiary.app`
- Revision: `2a50f21` (`fix(macos-release): 修正 DMG seal 與 LaunchAgent 寫入`)
- Timestamp: 2026-07-11 Asia/Taipei
- Test depth: Level 4
- Result: PASS for package, install, signature-after-startup, Core health, and LaunchAgent bootstrap

## Scenarios

- [PASS] Final DMG passes `hdiutil verify`, mounted app passes `codesign --verify --deep --strict`, and nested Mach-O files verify.
- [PASS] Quarantine diagnostic is rejected without sealed-resource, bundle-format, or invalid-signature errors.
- [PASS] Finder shows DevDiary, Applications shortcut, and drag-install background.
- [PASS] Fresh `/Applications/DevDiary.app` cold launch returns `ok: true` from `http://127.0.0.1:4317/api/health`.
- [PASS] Startup leaves `codesign --verify --deep --strict` valid and does not create `Contents/Resources/.launchagents`.
- [PASS] LaunchAgent source files are outside the bundle at `/Applications/.DevDiaryLaunchAgents`; the standard user LaunchAgents entry is a symlink and `launchctl print` resolves the new launcher.
- [BLOCKED] A clean second-Mac GitHub browser download click has not been performed; this is the remaining proof for exact Gatekeeper dialog wording.

## Evidence

- Artifact: `src-tauri/target/release/bundle/dmg/DevDiary_0.1.0_aarch64.dmg`.
- Commands: `cargo test`, `cargo check`, `npm run package:mac`, mounted verifier, local install/cold-launch health probe.

## Residual Risk

- This is valid ad-hoc signing, not Developer ID/notarization. Users must still use right-click Open or Privacy & Security manual approval.
