---
openspec_level: o2
template_version: owner-workflow/v1
change: support-launchagent-on-external-home
reasons: material_decision
---
# Delta Spec: Support LaunchAgent on an external HOME / dev-diary-macos-app

## 中文摘要

packaged App 的 LaunchAgent 可執行支援檔改放在 `.app` 同層的固定隱藏目錄，避免 HOME 位於 `noowners` 外接磁碟時被 macOS `launchd` 拒絕；development Core、logs 與資料仍留在 Application Support。

## Baseline

- Capability: `dev-diary-macos-app`
- Current Feature Spec: `openspec/specs/dev-diary-macos-app/spec.md`

## REMOVED Requirements

### Requirement: Background-runner support files stay in the user data boundary

**Reason**: The name and packaged-path contract incorrectly imply that executable LaunchAgent support can always remain on the user's app-data filesystem. A real external `noowners` HOME accepts the files but is rejected by `launchd`.

**Migration**: Replace this requirement with `Background-runner support files use a launchd-compatible local boundary`; the stable label, per-user registration, logs, validation and ownership controls remain compatible.

## ADDED Requirements

### Requirement: Background-runner support files use a launchd-compatible local boundary

The macOS shell SHALL generate the background launcher and source plist below a fixed `.DevDiaryLaunchAgents` sibling of the `.app` bundle when Core resolves from a packaged App, and below `<Application Support>/DevDiary/LaunchAgents` for a development Core path. It SHALL keep logs below the app-data boundary and SHALL register the stable label `com.ysjblog.devdiary.background` through a link at `~/Library/LaunchAgents`. New source content MUST be written and validated at a separate candidate path so validation failure leaves any live stable source byte-for-byte unchanged; only validated content may atomically replace the stable source before registration replacement. It MUST limit legacy cleanup and failure cleanup to files carrying DevDiary ownership markers or the exact link created by the current attempt, and MUST return/log a failure without deleting unrelated files. Unit tests MUST use pure paths or temporary directories and MUST NOT invoke real `launchctl`, modify the user's HOME, or install/uninstall an agent.

#### Scenario: Drag-installed App avoids an incompatible external HOME source

- **WHEN** Core resolves from `/Applications/DevDiary.app/Contents/Resources/core` while the user's Application Support is on a filesystem that `launchd` rejects for the executable support source
- **THEN** launcher and source plist resolve to `/Applications/.DevDiaryLaunchAgents`, while logs and SQLite remain in the user's DevDiary app-data directory.

#### Scenario: Development remains inside app data

- **WHEN** Core resolves from a development path without a `.app` ancestor
- **THEN** launcher and source plist resolve below the current user's DevDiary Application Support directory and use the same per-user registration-link contract.

#### Scenario: Invalid staged plist does not replace registration

- **WHEN** source plist validation fails before bootstrap
- **THEN** the installer removes the candidate, preserves the prior stable source byte-for-byte, reports failure before replacing the per-user registration, and does not invoke bootstrap.

#### Scenario: Failed current attempt cannot delete unrelated registration

- **WHEN** link creation or bootstrap fails and the registration path no longer points to the exact source from the current attempt
- **THEN** cleanup leaves that path untouched and reports the incomplete installation.

## Impacted Readers and Writers

- Readers: Tauri startup, macOS `launchd`, background runner, runtime operators.
- Writers: Rust LaunchAgent support-file installer and per-user registration link.
- Unchanged: Core API, settings, scheduler data, SQLite, logs, provider requests, and React UI.

## Compatibility and Migration

The stable label and registration path remain unchanged. A packaged App replaces only its owned registration with the fixed sibling source on successful startup. Development keeps the current app-data layout. Generated support files are recoverable; no user database migration or deletion occurs.

## Verification Mapping

- Pure path and validation ordering: Rust unit tests in `src-tauri/src/lib.rs`.
- Source contract and full suites: `doc/test/background-launchagent-runner.md` and repository verification commands.
- Downstream execution: installed App startup on the observed external-HOME Mac, `launchctl print`, Core health, schedule/provider checks, and SQLite integrity/count comparison.

## Open Questions

None.
