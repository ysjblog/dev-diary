# Final Closer Root Cause Record

## 中文摘要

最終規格審查拒絕的原因不是版本號，而是發布權限與 DMG 選取不具決定性。使用者確認擴大修正後，最小修正落在只讀 Actions workflow、精確版本化 DMG 選取、掛載後版本驗證與回歸測試；其後由使用者授權建立新的 `v0.1.2` Release，且只因 checksum 路徑格式錯誤而更正過同名 checksum 檔。

## ROOT CAUSE DEBUGGING

- Symptom: `SOL-FC-001` found two potential publishers; `SOL-FC-002` found glob/first-match artifact selection that could publish a stale DMG.
- Reproduction: `.github/workflows/macos-release.yml` used tag-push trigger, `contents: write`, `gh release create/upload`, and `--clobber`; `scripts/package-mac-release.sh` selected `find ... '*.dmg' | head -n 1`.
- Observed evidence: the local DMG directory contained old `0.1.1` artifacts while an incomplete early `0.1.2` artifact failed the mounted signature verifier; a completed fresh package later passed the same verifier.
- Root cause: release publication authority was duplicated and artifact identity was determined by directory enumeration instead of the declared application version.
- Fix boundary: `.github/workflows/macos-release.yml`, `scripts/package-mac-release.sh`, `scripts/verify-macos-release.sh`, version declarations, README, and the regression test only.
- Verification: release-distribution regression tests, root/Core suites, build, fresh package, mounted verifier, checksum verification, and independent offline QA report.
- Published evidence: `main`、annotated `v0.1.2` 與 Release 同指向 `8c71412`; the remote DMG is 87,623,444 bytes with SHA-256 `6502c4d6c3cb31b78e2385ba6939edc8f53e97b0349ff692c7f252177ef566eb`; a fresh remote download passes `shasum -a 256 -c SHA256SUMS.txt`.
- Residual risk: Developer ID/notarization and a real end-user Finder click remain outside this local artifact proof.

## ROOT CAUSE DEBUGGING: closeout revision drift

- Symptom: fresh O3 closer `SOL-FC-003` rejected archive because the design described `8c71412` as the current checkout even after closeout documentation advanced local `main` to `7d7aec5`.
- Reproduction: compare `git rev-list --left-right --count v0.1.2...HEAD` (`0 1`), `git ls-remote origin refs/heads/main` (`8c71412`), and the design's former single source-of-truth wording.
- Observed evidence: `v0.1.2` is annotated at `8c71412`; the Release asset and checksum are tied to that immutable commit, while the later commit is documentation-only and was not pushed when the closer reviewed it.
- Root cause: one sentence used "current main" for two different identities: the immutable release candidate and the later documentation revision.
- Fix boundary: release design and closeout-review records only; no packaged source, tag, Release asset, or remote target changes.
- Verification: strict validation, fresh author preflight, targeted release guard, `git ls-remote`, GitHub Release readback, and a bounded post-root-cause closer.
- Residual risk: the documentation revision must be pushed after archive; this does not alter `v0.1.2`.
