# Final Closer Root Cause Record

## 中文摘要

最終規格審查拒絕的原因不是版本號，而是發布權限與 DMG 選取不具決定性。使用者確認擴大修正後，最小修正落在只讀 Actions workflow、精確版本化 DMG 選取、掛載後版本驗證與回歸測試；未建立或覆寫任何遠端 Release。

## ROOT CAUSE DEBUGGING

- Symptom: `SOL-FC-001` found two potential publishers; `SOL-FC-002` found glob/first-match artifact selection that could publish a stale DMG.
- Reproduction: `.github/workflows/macos-release.yml` used tag-push trigger, `contents: write`, `gh release create/upload`, and `--clobber`; `scripts/package-mac-release.sh` selected `find ... '*.dmg' | head -n 1`.
- Observed evidence: the local DMG directory contained old `0.1.1` artifacts while an incomplete early `0.1.2` artifact failed the mounted signature verifier; a completed fresh package later passed the same verifier.
- Root cause: release publication authority was duplicated and artifact identity was determined by directory enumeration instead of the declared application version.
- Fix boundary: `.github/workflows/macos-release.yml`, `scripts/package-mac-release.sh`, `scripts/verify-macos-release.sh`, version declarations, README, and the regression test only.
- Verification: release-distribution regression tests, root/Core suites, build, fresh package, mounted verifier, checksum verification, and independent offline QA report.
- Residual risk: no remote `v0.1.2` tag or Release exists yet. Developer ID/notarization and a real end-user Finder click remain outside this local artifact proof.
