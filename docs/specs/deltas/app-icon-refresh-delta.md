# Delta Spec: App Icon Refresh
> PR: feature/core-engine
> Date: 2026-07-05
> Status: implemented

## 新增（Added）

- No new runtime feature.

## 修改（Changed）

- Replaced the tracked Tauri icon set under `src-tauri/icons/` with the new DevDiary orbit logo source.
- Regenerated macOS bundle icon assets used by `DevDiary.app`.
- Rebuilt the unsigned macOS `.app` and `.dmg` after the icon update.

## 移除（Removed）

- No user-facing feature or runtime code was removed.

## 影響範圍（Impact）

- macOS Finder / Dock app icon and packaged app branding.
- No Core API, SQLite schema, scheduler, settings, or user data behavior changes.

## 驗收條件

- [x] `npm run package:mac` completes after the icon update.
- [x] Packaged app icon matches `src-tauri/icons/icon.icns`.
- [x] Packaged app launches Core on loopback.
- [x] Quitting the packaged app stops the app process and clears the `127.0.0.1:4317` listener.
