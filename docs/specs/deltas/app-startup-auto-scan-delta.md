# App Startup Auto Scan Delta

Status: implemented
Branch: feature/core-engine
Date: 2026-07-01

## Context

Packaged macOS app users should not need to open Terminal or run `core && npm start` before using DevDiary. The Tauri shell launches the bundled Core process, but the React UI can render before Core is ready, causing one-shot `Load failed` states on Dashboard and Settings.

## Change

- Dashboard, Settings, sidebar stats, agent detection, scheduler status, and project list startup reads retry transient Core startup failures.
- Retry is limited to transport/startup failures such as `Load failed` / `fetch failed`; validation and contract errors still surface immediately.
- When Core is connected and persisted `project_roots` are present, the app automatically runs one global scan per UI session.
- Manual `更新日誌` / scan buttons keep the same Core API path and visible progress state.
- Packaged Tauri webview requests from `tauri://localhost` are allowed to read the loopback Core API through a narrow local CORS allowlist; arbitrary website origins are not granted browser read access.

## Acceptance

- Opening the packaged `.app` is enough for Core API data to appear after Core finishes starting.
- Settings should recover from transient startup races without staying on `Load failed`.
- Dashboard should auto-refresh through a startup scan when configured roots already exist.
- App shell keeps native macOS traffic lights only, with no inner prototype black frame.
- Core `GET`/`OPTIONS` responses include CORS headers for the packaged Tauri origin and localhost dev origins only.
