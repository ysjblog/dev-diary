# Delta Spec: Dynamic Core port discovery for dev runtime
> PR: feature/core-engine
> Date: 2026-06-30
> Status: implemented

## 新增（Added）

- Core startup can fall forward from the preferred local port when an older Core process still owns it.
- Core writes a redacted runtime manifest at the macOS app data path, or `DEVDIARY_CORE_MANIFEST` when explicitly set.
- Vite dev proxy resolves the active Core target from `DEVDIARY_CORE_URL`, then runtime manifest, then the legacy `4317` fallback.
- Runtime manifest includes only service identity, local URL, pid, started time, API contract version, and capabilities.

## 修改（Changed）

- Dev UI API calls no longer require Vite to assume Core is always on `127.0.0.1:4317`.
- `/api/health` now reports the actual bound Core port after fallback allocation.

## 移除（Removed）

- 不適用。

## 影響範圍（Impact）

- Core startup lifecycle.
- Local HTTP API health identity.
- Vite dev proxy behavior.
- Runtime troubleshooting and smoke tests.

## 驗收條件

- [x] If the preferred Core port is busy, Core binds a later loopback port and reports that port in `/api/health`.
- [x] Core writes a runtime manifest without project roots, env vars, tokens, or raw command lines.
- [x] Vite dev proxy can call `/api/health`, `/api/scheduler/daily`, `/api/agents/detect`, and `/api/scheduler/daily/run` through the discovered Core port.
- [x] Explicit `DEVDIARY_CORE_URL` still wins for advanced/manual dev routing.
- [x] Packaged Tauri lifecycle remains out of scope for this delta.
