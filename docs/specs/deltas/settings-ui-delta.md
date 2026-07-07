# Delta Spec: Settings UI Core API Wiring

> PR: feature/core-engine
> Date: 2026-06-29
> Status: implemented

## 新增（Added）

- React Settings page now loads from `GET /api/settings`.
- React Settings page can save Settings backend fields through `PATCH /api/settings`:
  - `project_roots`
  - `excluded_paths`
  - `scan_interval_minutes`
  - `default_diary_agent`
  - `privacy`
  - `appearance`
  - `data_storage.desired_db_path`
  - `scan_provider`
  - `agents.enabled`
- Root Settings API client converts textarea/form state into the structured Core settings patch shape.
- Agents page enabled toggles now persist canonical agent enable state through Settings backend when a settings snapshot is available.

## 修改（Changed）

- Settings UI no longer keeps Project Roots, Appearance, Privacy, Scan Interval, and Agent enabled state as prototype-only local state.
- Settings copy clarifies that Data Storage path changes are desired-next-start values and require restart; UI does not hot-swap SQLite.
- Agents page copy no longer claims real agent detection or SQLite writes for unsupported add/remove flows.
- `MASTER.md` marks Settings UI wiring as implemented in the current UI-to-Core progress.

## 移除（Removed）

- Removed the Settings page's hard-coded local-only project root textarea behavior.
- Removed misleading Settings backup/export action from this slice; storage export remains outside current backend contract.

## 影響範圍（Impact）

- Affected modules: React app state, Settings page rendering, Agents enabled toggles, Settings API client, root tests, docs/specs.
- React still does not read SQLite, scan project folders, read credentials, or execute configured paths.
- Backend settings validation remains the source of truth; failed PATCH responses keep the current UI snapshot.
- Real agent detection / safe probe remains future work; this delta only persists canonical enabled flags.

## 驗收條件

- [x] Settings page loads current settings from `GET /api/settings`.
- [x] Project roots, appearance, scan interval, privacy, and agent enabled state can be changed and saved with `PATCH /api/settings`.
- [x] Reload after save shows persisted Settings backend values.
- [x] Settings UI does not directly read/write SQLite or project folders.
- [x] Core tests, Core typecheck, root API client test, root build, and `git diff --check` pass.
- [x] Desktop and mobile localhost smoke verifies the Settings page has no overlap or broken controls.
