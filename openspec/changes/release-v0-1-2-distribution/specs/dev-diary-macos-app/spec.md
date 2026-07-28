---
openspec_level: o3
template_version: owner-workflow/v1
change: release-v0-1-2-distribution
reasons: external_write
---
# Delta Spec: DevDiary macOS Development Diary Feature Spec

## 中文摘要

每份公開 macOS DMG 都必須有可追溯的新版本：應用程式版本、檔名、Git tag、GitHub Release 與 checksum 必須指向同一提交。既有 release 不可被新建置覆蓋。

## Baseline

Capability: `dev-diary-macos-app`

## MODIFIED Requirements

### Requirement: Packaging and desktop startup boundary

The system SHALL start the Core through the Tauri desktop shell, clean up the child process on quit, and package the macOS release with the documented manual-approval/ad-hoc-seal flow, bundled Node runtime, Applications drag-install metadata, and background-runner installation behavior. Each public DMG release MUST use one new semantic version consistently across root npm metadata, npm lockfile root metadata, Tauri metadata, Cargo metadata, artifact filename, immutable Git tag, GitHub Release, and SHA-256 checksum. The release workflow MUST be manually dispatched, verify the mounted artifact before upload, and fail before publication if its requested tag, release, or expected asset already exists. The single authorized publisher MUST preflight the remote target and MUST NOT overwrite, delete, retarget, or replace an existing tag or release asset. A partial upload MUST be resumed only after readback verifies the tag/release target and every existing asset digest.

#### Scenario: User launches the packaged app on a fresh machine

- **WHEN** the user opens the packaged app and allows it through the macOS manual approval flow
- **THEN** the shell starts a loopback Core, resolves its runtime origin, serves the UI, and does not require the user to run a separate Node installation command.

#### Scenario: Maintainer publishes a new DMG version

- **WHEN** a maintainer has explicit authorization to publish a verified new release
- **THEN** the version declarations, artifact filename, immutable Git tag, GitHub Release asset, and published SHA-256 value all identify the same version and commit, while earlier release assets remain unchanged.

#### Scenario: Upload cannot complete

- **WHEN** tag push or GitHub asset creation fails after local artifact verification
- **THEN** the workflow stops without overwriting an existing release asset and reports the exact recoverable remote state before any later retry.

## Impacted Readers and Writers

- Writers: `package.json`, `package-lock.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, `README.md`, `.github/workflows/macos-release.yml`, Git tag, and GitHub Release upload.
- Readers: npm/Tauri/Cargo packaging, release users, README installation instructions, GitHub Releases download page, and integrity verifiers.

## Compatibility and Migration

`v0.1.1` remains downloadable and unchanged. `v0.1.2` is a new Apple Silicon release and retains manual macOS approval; no user data migration occurs.

## Verification Mapping

Run root `npm test` and `npm run build`, Core tests/typecheck, `scripts/verify-macos-release.sh`, Info.plist version inspection, SHA-256 generation, exact tag-target readback, and GitHub Release asset readback.

## Open Questions

Use `v0.1.2`, not an overwrite of `v0.1.1`.
