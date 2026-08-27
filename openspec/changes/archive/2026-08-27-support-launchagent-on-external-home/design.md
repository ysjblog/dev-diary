---
openspec_level: o2
template_version: owner-workflow/v1
change: support-launchagent-on-external-home
reasons: material_decision
---
# Technical Design: Support LaunchAgent on an external HOME

## 中文摘要

packaged Core 會從自己的 `.app` ancestor 衍生固定的 `.DevDiaryLaunchAgents` sibling；development Core 仍用 `<Application Support>/DevDiary/LaunchAgents`。launcher/plist 內容、驗證順序、`~/Library/LaunchAgents` registration symlink、app-data logs 與 ownership guard 均不變。這是路徑選擇的最小修復。

## Context

- Installed 0.1.4 wrote a valid mode-0600 source plist below external-HOME Application Support.
- `plutil -lint` passed, but both App startup and a bounded manual `launchctl bootstrap` returned exit 5 / I/O error.
- The external data volume is mounted `nodev,nosuid,noowners`; `/Applications` is a different local APFS device.
- The prior packaged sibling source under `/Applications/.DevDiaryLaunchAgents` successfully registered the same stable label.

## Goals / Non-Goals

- Goal: make the packaged background runner executable by `launchd` on the reproduced external-HOME topology.
- Goal: preserve safe validation, ownership, cleanup, stable label, and private-data boundaries.
- Non-goal: dynamically interpret arbitrary mount output, change the registration label, or move logs/database content.

## Runtime Path and Data Flow

1. Tauri resolves the trusted Core directory.
2. NEW `packaged_launch_agent_storage_dir` locates the nearest `.app` ancestor and returns a fixed `.DevDiaryLaunchAgents` sibling.
3. `resolve_launch_agent_storage_dir` selects that sibling for packaged Core, otherwise `launch_agent_storage_dir(app_data_dir)` for development.
4. Existing writers generate launcher and candidate plist, validate the candidate, atomically promote it, replace only an owned registration, then bootstrap the stable label.
5. Logs remain below DevDiary app data; the launcher executes the fixed bundled Core path.

## Decisions

- Selected: restore packaged sibling storage because it is deterministic, already proven on the target Mac, and keeps executable support off the rejected external volume.
- Rejected: always use Application Support, because the real bootstrap fails despite writable files and valid plist syntax.
- Rejected: parse `mount` output at runtime, because locale/format parsing adds a shell-derived policy surface and still needs an alternate location.
- Rejected: use a temporary/cache directory, because purge can silently remove the runner between App launches.

## Contract Inventory

| Contract | Producer | Consumer | Change |
|---|---|---|---|
| support base directory | Rust path helper | LaunchAgent installer | packaged Core selects fixed `.app` sibling |
| registration symlink | installer | `launchd` | unchanged `~/Library/LaunchAgents` path |
| launcher/plist contents | existing Rust generators | bash / `launchd` | unchanged fixed arguments |
| logs and SQLite | Core/Tauri | user/runtime | unchanged app-data paths |

## Execution Order and Failure Recovery

Candidate generation and `plutil` validation remain before stable-source and registration replacement. Bootstrap failure removes only the exact registration link created by that attempt and logs failure. No unrelated LaunchAgent or App data is deleted.

## Security and Privacy

Protected assets are local code-execution integrity and user data. The only path inputs are the already-resolved Core directory and fixed app-data path; no API/provider/user string reaches the support-directory derivation or shell arguments. The fixed sibling contains generated executable support only, never database rows, prompts, tokens, or credentials. Existing ownership-marker and exact-link cleanup controls remain on the hot path.

## Migration and Rollback

On first successful 0.1.4 launch, existing legacy owned registrations may be replaced with the packaged sibling source. If rollout verification fails, quit the App, boot out the exact DevDiary label, restore the preserved 0.1.2 App, reinstall only its owned LaunchAgent registration, and relaunch while preserving the current SQLite database. A database restore is not part of the default rollback because this Change has no database migration; it would require a separately proven schema incompatibility, a fresh backup of the current database, integrity/count checks, and explicit destructive-action authority. The new sibling support directory is recoverable generated state; this Change does not authorize deleting it.

## Risks / Trade-offs

- The installed App parent must be writable by the launching user. Typical `/Applications` installs by an admin user meet this on the target host; managed non-admin layouts remain a documented proof gap.
- A mounted DMG is read-only and not a supported install location for background registration.

## Open Questions

None.
