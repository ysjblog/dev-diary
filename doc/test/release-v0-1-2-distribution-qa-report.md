# QA Black-Box Report

- Environment: macOS local filesystem; offline verification of the built arm64 DMG only. No install, Git operation, network request, or external write was performed.
- Revision / HEAD SHA: `92c7708dad909f453df88b65f9a102e40a649d81`
- Timestamp: `2026-07-28T15:20:03Z`
- Target URL / public entry: `src-tauri/target/release/bundle/dmg/DevDiary_0.1.2_aarch64.dmg`
- Test depth: Level 4 local release-artifact black-box QA; mounted DMG integrity, metadata, signing, and quarantine/manual-approval diagnostic.
- Owner / QA Worker identity: Owner `/root`; independent QA Worker `/root/release_dmg_qa`.
- Independence method: The QA Worker did not inspect implementation changes or use the Owner's conclusion. It independently consumed only the release test instructions, verifier script, DMG, and checksum manifest.
- Bounded lens used: Offline distribution artifact and manual-approval state only.
- Result: PASS

## Scenarios

- [PASS] SHA-256 manifest validation. Expected: the named `DevDiary_0.1.2_aarch64.dmg` matches `SHA256SUMS.txt`. Actual: `shasum -a 256 -c src-tauri/target/release/bundle/dmg/SHA256SUMS.txt` returned `OK`; digest was `567fb699fab58547f6871ff76de8ab4e330c697f2a4e474c27401bb1df281bc0`.
- [PASS] Mounted release-artifact verification. Expected: a readable DMG contains the app, matching version/build, Applications shortcut, configured Finder background, and valid sealed executable signatures. Actual: `scripts/verify-macos-release.sh src-tauri/target/release/bundle/dmg/DevDiary_0.1.2_aarch64.dmg` completed successfully; disk-image checksum was valid and the script reported a valid ad-hoc manual-approval release DMG.
- [PASS] Version and artifact-name consistency. Expected: filename and both app version fields are `0.1.2`. Actual: independent read-only mount found filename `DevDiary_0.1.2_aarch64.dmg`, `CFBundleShortVersionString=0.1.2`, and `CFBundleVersion=0.1.2`.
- [PASS] Final ad-hoc signature and sealed resources. Expected: the packaged app uses the expected ad-hoc signature with sealed resources. Actual: `codesign --display --verbose=4` returned `Signature=adhoc` and `Sealed Resources version=2 rules=13 files=2098`; the verifier's strict deep verification also passed.
- [PASS] Quarantine/manual-approval diagnostic. Expected: a quarantined copy without Developer ID is rejected for manual approval, not because the bundle is damaged. Actual: the verifier's quarantined temporary copy was `rejected`; its guard explicitly found no `sealed resource`, `code signature not valid`, `bundle format unrecognized`, or `invalid signature` evidence and therefore completed successfully.

## Evidence

- Screenshots: Not applicable: this bounded offline artifact check uses a mounted DMG and command-line system assessments, not a product UI flow.
- Commands / artifacts:
  - `shasum -a 256 -c src-tauri/target/release/bundle/dmg/SHA256SUMS.txt`
  - `shasum -a 256 src-tauri/target/release/bundle/dmg/DevDiary_0.1.2_aarch64.dmg`
  - `scripts/verify-macos-release.sh src-tauri/target/release/bundle/dmg/DevDiary_0.1.2_aarch64.dmg`
  - Read-only temporary mount with `/usr/libexec/PlistBuddy` and `codesign --display --verbose=4`.
- Console errors: None from the successful checks. The expected Gatekeeper diagnostic was a rejection of the quarantined ad-hoc copy.
- Network/API errors: Not applicable; no network or API access was used.

## Findings

- Severity: None within this bounded local-artifact lens.
- Reproduction steps: Not applicable; all required local artifact scenarios passed.
- Expected: The release DMG is intact, consistently versioned, sealed, and is rejected only as an unsigned/ad-hoc quarantined app requiring user approval.
- Actual: Observed as expected.

## Residual Risk

This PASS is limited to the local DMG. The app is ad-hoc signed (`TeamIdentifier=not set`) and not Developer-ID signed or notarized, so a user who downloads it must manually approve it in Finder/System Settings. This report does not prove Finder interaction by an end user, remote release/tag/asset consistency, upload success, malware scanning, or a production release; those remain separate checks before any publish action.
