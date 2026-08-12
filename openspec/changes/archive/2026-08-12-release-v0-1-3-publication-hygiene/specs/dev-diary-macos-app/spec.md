---
openspec_level: o3
template_version: owner-workflow/v1
change: release-v0-1-3-publication-hygiene
reasons: external_writes, production_contract_changes, credentials_secrets
---
# Delta Spec: DevDiary macOS Development Diary Feature Spec

## 中文摘要

現行公開 source 與新發布物不得帶出 maintainer 真實 checkout、volume 或使用者 home identity；新 DMG 仍須由同一個已驗證 commit、版本、immutable tag、GitHub Release 與 checksum 共同識別，且舊發布不可被覆寫。

## Baseline

Capability: `dev-diary-macos-app`

## ADDED Requirements

### Requirement: Public release source privacy boundary

The system MUST keep current tracked production source, active specifications, release documentation and newly generated public release notes free from maintainer-specific checkout paths, private volume/user-home identifiers and literal production demo roots of the form `/Users/<name>/...`. It MUST preserve immutable legacy provenance under `docs/specs/legacy/`, anonymous test fixtures and standard operating-system executable/application candidates when they are needed to explain history or verify behavior. Runtime seed paths MUST derive from a non-identifying OS-owned temporary boundary, while UI placeholder or fallback data MUST use a non-filesystem example or the current Core detection state. The privacy scanner MUST derive the current checkout/account identity without embedding the maintainer identity literal in tracked scanner source, and MUST check the release body both before creation and after remote readback.

#### Scenario: Maintainer prepares current source for publication

- **WHEN** the exact candidate's tracked current text and production source are scanned before commit and again before publication
- **THEN** no real maintainer checkout/home/volume identifier or literal production `/Users/<name>/...` demo root is present outside the documented legacy/fixture/platform-candidate exceptions.

#### Scenario: Required historical and platform paths are evaluated

- **WHEN** a legacy provenance record, anonymous test fixture or standard macOS executable/application candidate contains an absolute path
- **THEN** it remains unchanged when it does not identify the maintainer and is still required by history or functional verification.

## MODIFIED Requirements

### Requirement: Packaging and desktop startup boundary

The system SHALL start the Core through the Tauri desktop shell, clean up the child process on quit, and package the macOS release with the documented manual-approval/ad-hoc-seal flow, bundled Node runtime, Applications drag-install metadata, and background-runner installation behavior. Each public DMG release MUST use one new semantic version consistently across root npm metadata, npm lockfile root metadata, Tauri metadata, Cargo metadata, artifact filename, immutable Git tag, GitHub Release, and SHA-256 checksum. Before publication, the exact clean candidate commit MUST pass current-source privacy checks, automated source gates, mounted DMG verification, isolated bundled-Core health, independent black-box QA and a fresh security closer; the resulting App and DMG identity and digest MUST remain bound to that revision. The single authorized publisher MUST preflight the remote target and MUST NOT force-push, overwrite, delete, retarget or replace an existing tag, release or asset. A partial upload MUST be resumed only after readback verifies the tag/release target and every existing asset digest.

#### Scenario: User launches the packaged app on a fresh machine

- **WHEN** the user opens the packaged app and allows it through the macOS manual approval flow
- **THEN** the shell starts a loopback Core, resolves its runtime origin, serves the UI, and does not require the user to run a separate Node installation command.

#### Scenario: Maintainer publishes a new DMG version

- **WHEN** a maintainer has explicit authorization and all revision-bound source, package, security and independent QA evidence passes
- **THEN** publication-time local `main`, remote `main`, version declarations, artifact filename, immutable Git tag, GitHub Release asset and downloaded SHA-256 value identify the same release commit, while earlier release assets remain unchanged.

#### Scenario: Successful release is closed out in current documentation

- **WHEN** remote asset readback and every required completion gate have passed
- **THEN** the Change is archived and a documentation-only commit may advance local and remote `main` together while `v0.1.3` remains immutable on the tested release commit.

#### Scenario: Candidate or upload drifts

- **WHEN** the source revision, artifact digest, remote target or an existing asset differs from the reviewed candidate
- **THEN** publication stops without force-pushing, overwriting, deleting or retargeting remote state and reports the exact recoverable state before any later retry.

## Impacted Readers and Writers

- Writers: version metadata/readme, seed/UI fallback source, active documentation, local main/tag, `origin/main`, GitHub tag/Release/assets.
- Readers: npm/Tauri/Cargo packaging, app startup and seed consumers, repository users, release users, mounted verifier, checksum/readback checks.

## Compatibility and Migration

No SQLite or settings migration is required. Existing v0.1.2 and legacy provenance remain unchanged. v0.1.3 remains Apple Silicon and ad-hoc signed with the documented manual-approval flow. A bad published artifact is corrected by a new version, not replacement.

## Verification Mapping

- `src/api/releaseDistribution.test.js`: version (including npm lock root and Cargo lock `app` entry), workflow and current-source hygiene contract.
- Complete Core/UI/Rust suites and build/type gates: source/runtime compatibility.
- Package verifier plus isolated bundled-Core smoke: App/DMG integrity without private runtime data or `/Applications` install.
- Fresh independent black-box/security receipts and GitHub asset download: revision, authority and digest identity.

## Open Questions

None. Public binary delivery is a GitHub Release DMG/checksum pair; binary artifacts are not committed into Git.
