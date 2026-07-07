# Test Cases: Dynamic Core port discovery for dev runtime

## Test Depth Route

- Level: 3
- Reason: Core startup, local API contract, Vite dev proxy, and CLI capability checks cross process/runtime boundaries.
- Required verification: unit tests for allocator/manifest/target resolution, typecheck/build, localhost smoke through Vite proxy.
- Allowed skips: no real Claude/Codex/Antigravity generation calls; safe detection probes only.

## Bug Pattern Coverage

- [x] Boundary values / empty / null / malformed input: invalid ports and malformed manifests fall back safely.
- [x] Contract generated and execution applied: Core writes manifest and Vite resolves the proxy target from it.
- [x] Operation order invariants: Core binds first, then writes manifest with the actual port.
- [x] Production-like dirty data: malformed or non-loopback manifest is ignored.
- [x] State/history/retry/refresh behavior: occupied preferred port falls forward.
- [x] Externally observable result, not only implementation detail: localhost Vite proxy smoke calls Core routes.

## Runtime Verification Route

- Runtime smoke: REQUIRED
- Black-box QA: OPTIONAL; no visible UI layout change in this slice.
- Safe environment or localhost command: `DEVDIARY_DB=:memory: DEVDIARY_PORT=0 npm start` in `core/`, then `npm run dev` and `fetch http://localhost:5173/api/...`.
- Safe test account / mock access: no real model generation; detection uses fixed `--version` / `--help` style probes.
- Forbidden or destructive actions: no writes to project folders, no Git mutation, no raw credentials in manifest.

## [x] 【function 邏輯】Core port allocator falls forward

**範例輸入**：one local server already listens on a dynamic port; start another Core server preferring that same port.
**期待輸出**：second server binds `preferred + 1` and reports `fallbackUsed=true`.

## [x] 【function 邏輯】Runtime manifest is redacted

**範例輸入**：write manifest for port `4321`.
**期待輸出**：manifest includes local URL, pid, contract version, capabilities; does not include env vars, project roots, tokens, or command lines.

## [x] 【function 邏輯】Vite target resolver prefers explicit URL, then manifest, then legacy fallback

**範例輸入**：`DEVDIARY_CORE_URL`, a valid manifest, malformed manifest, and no config.
**期待輸出**：explicit URL wins; valid manifest returns loopback URL; malformed/non-loopback manifest is ignored; final fallback is `127.0.0.1:4317`.

## [x] 【整合流程】Vite proxy reaches dynamic Core port

**範例輸入**：Core starts with `DEVDIARY_PORT=0`, Vite starts after manifest exists, then caller hits `http://localhost:5173/api/health`.
**期待輸出**：HTTP 200 and health runtime port equals the manifest port, not hard-coded `4317`.

## [x] 【整合流程】Safe probe order before provider execution

**範例輸入**：through Vite proxy call `/api/health`, `/api/scheduler/daily`, `/api/agents/detect`, then `/api/scheduler/daily/run` against a fallback-only in-memory runtime.
**期待輸出**：health connected, scheduler route 200, detection route 200 with sanitized results, run-now 200 with deterministic fallback rather than 404 or raw CLI error.
