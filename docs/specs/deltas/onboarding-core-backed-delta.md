# Delta Spec: Core-Backed First Launch Onboarding
> PR: feature/core-engine
> Date: 2026-07-01
> Status: implemented

## 新增（Added）

- First-launch onboarding overlay for users without configured `project_roots`.
- Onboarding steps:
  - Welcome.
  - CLI agent detection via Core API.
  - Project roots entry saved through `PATCH /api/settings`.
  - Candidate project scan through `POST /api/scan`.
  - AI diary agent / storage confirmation using existing settings fields.
  - Complete and enter Dashboard.
- Completion state stored in local UI storage after project roots are saved or scan completes.

## 修改（Changed）

- App no longer silently starts in Dashboard when no project roots are configured.
- Onboarding uses the same Core API paths as Settings and Dashboard scan; no React direct filesystem access.

## 移除（Removed）

- No existing runtime behavior removed.

## 影響範圍（Impact）

- React app startup flow, Settings API helper usage, manual scan flow, UI/browser verification, docs/spec status.

## 驗收條件

- [x] Fresh UI with no configured project roots shows onboarding before normal Dashboard work.
- [x] Onboarding can detect canonical agents through Core API.
- [x] Onboarding refuses completion until at least one project root is provided.
- [x] Project roots save through `PATCH /api/settings`, not local-only state.
- [x] Onboarding scan uses `POST /api/scan` and shows success/failure state.
- [x] Completing onboarding enters Dashboard and does not re-open on refresh.
- [x] UI desktop/mobile checks pass without overlap.
