# Local API Runtime Discovery / Stale Runtime Detection Test Plan

## Test Depth Route

- Level: 3
- Reason: Adds a Core runtime contract consumed by Settings UI, plus stale-runtime error handling for API routes.
- Required verification: Core API tests, UI API helper tests, Build, Typecheck, runtime API smoke, Settings browser screenshot.
- Allowed skips: OS-level dynamic port allocator remains out of scope for this slice.

## Bug Pattern Coverage

- [ ] Input normalization / aliases / format variants: not applicable; no user-entered runtime URL in this slice.
- [x] Boundary values / empty / null / malformed input: stale Core health missing contract fields.
- [x] Rule priority conflicts: route 404 should surface stale-runtime guidance before generic API failure.
- [x] Contract generated and execution applied: Core `/api/health` reports capabilities and Settings UI consumes them.
- [x] Operation order invariants: Settings reload fetches runtime health before showing stale status.
- [x] Production-like dirty data: old Core health shape with only `ok/service/captured_at`.
- [x] Security bypass mixed with normal input: Core exposes only loopback runtime metadata, no secrets or env dump.
- [x] State/history/retry/refresh behavior: reloading Settings refreshes runtime status.
- [x] Externally observable result, not only implementation detail: Settings shows Core port/contract/stale warning.

## Runtime Verification Route

- Runtime smoke: REQUIRED
- Black-box QA: REQUIRED
- Safe environment or localhost command: Core on `127.0.0.1:4317`, Vite on `http://localhost:5173`
- Safe test account / mock access: not applicable
- Forbidden or destructive actions: do not expose env vars, tokens, arbitrary process command lines, or remote network binding.

## [x] 【Mock API】Core health reports runtime identity and capabilities
**範例輸入**：`GET /api/health` against a test Core server.
**期待輸出**：HTTP 200 includes `api_contract_version`, `port`, `pid`, `started_at`, `capabilities`, and no secrets.

## [x] 【function 邏輯】UI classifies current vs stale Core runtime
**範例輸入**：current health payload, old health payload, failed fetch.
**期待輸出**：current is `connected`; old/missing contract is `stale`; failed fetch is `unreachable`.

## [x] 【錯誤處理】Route 404 becomes stale-runtime guidance
**範例輸入**：`POST /api/scheduler/daily/run` returns HTTP 404 with non-JSON body.
**期待輸出**：UI helper throws a plain-language stale Core runtime message.

## [x] 【前端元素】Settings shows Local HTTP API runtime status
**範例輸入**：Open Settings with current Core.
**期待輸出**：Settings displays Core URL/port, contract version, capabilities, last check time, and no stale warning.

## [x] 【整合流程】Run now remains usable after runtime detection
**範例輸入**：Settings default diary agent is `antigravity-cli`; click Run now.
**期待輸出**：`POST /api/scheduler/daily/run` returns 200, not 404; scheduler status updates to success or structured fallback.
