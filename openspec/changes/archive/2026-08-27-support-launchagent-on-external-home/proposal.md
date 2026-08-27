---
openspec_level: o2
template_version: owner-workflow/v1
change: support-launchagent-on-external-home
reasons: material_decision
---
# Change Proposal: Support LaunchAgent on an external HOME

## 中文摘要

DevDiary 0.1.4 的 packaged App 目前把 LaunchAgent launcher 與來源 plist 放在使用者 Application Support。當 HOME 位於以 `noowners` 掛載的外接磁碟時，檔案可寫且 plist lint 成功，但 macOS `launchd` 仍以 I/O error 拒絕 bootstrap，導致關閉 App 後背景排程不會執行。本 Change 恢復 packaged App 的本機同層支援目錄，development runtime 仍使用 Application Support，logs 與資料庫位置不變。

## Why

The installed 0.1.4 candidate reproduced a real deployment failure on a Mac whose HOME is on a `noowners` external APFS volume. Static path tests asserted the configured path but never executed the generated registration through `launchd`, so they certified a contract that is not runnable in this supported local setup.

## What Changes

- Modify the existing background-runner storage requirement for packaged Core paths.
- Derive packaged support storage as a fixed hidden sibling of the `.app` bundle, while development Core continues to use app data.
- Preserve per-user registration, candidate validation, ownership checks, app-data logs, and exact-attempt cleanup.
- Add a regression test and a real installed-runtime smoke on the external-HOME host.

## Scope

- Capability: `dev-diary-macos-app`.
- Rust/Tauri LaunchAgent path selection, tests, current Feature Spec, and MASTER index.
- Local rebuild and authorized replacement of `/Applications/DevDiary.app`.

## Non-Goals

- No scheduler, provider, database, UI, signing, notarization, public release, push, or remote deployment behavior changes.
- No attempt to support launching directly from a read-only DMG or an App Translocation path.
- No writes to project folders and no deletion of the old App or database backup.

## Capabilities

### Modified Capabilities

- `dev-diary-macos-app`: background-runner support-file placement for packaged and development Core paths.

## Impact

Packaged App startup can register its background runner when HOME is on the observed external `noowners` volume. Development remains user-scoped under Application Support. The packaged support directory must be writable; an unwritable installation parent continues to produce a logged, recoverable install failure.

## Risks

- A packaged App installed under a parent directory that the current user cannot write cannot create the sibling support directory.
- Moving the generated support source does not move logs or private database content out of app data.
- The source path is derived only from the resolved packaged Core ancestry and a fixed directory name; no user-provided path is passed to the shell.

## Open Questions

None. The observed host, prior working 0.1.2 layout, and existing rollback copy make the selected behavior testable and reversible.

## Completion Evidence

- Strict OpenSpec validation, Author Preflight, and one focused O2 independent review.
- Failing-then-passing Rust path regression plus full relevant suites and security/diff verification.
- Fresh package verification and actual installed-App `launchctl`/Core/SQLite/settings/provider smoke on the external-HOME host.
