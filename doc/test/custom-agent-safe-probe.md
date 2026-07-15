# Custom Agent Safe Probe Test Plan

## Test Depth Route

- Level: 3
- Reason: The change touches user-provided executable paths, Core API routes, persistence, UI workflow, and shell-command-adjacent probing.
- Required verification: Core unit/API tests, UI API helper tests, browser/RWD smoke, runtime smoke, typecheck, build, diff review.
- Allowed skips: real third-party custom CLI auth; tests use temporary fake executables and localhost runtime.

## Bug Pattern Coverage

- [x] Input normalization / aliases / format variants
- [x] Boundary values / empty / null / malformed input
- [x] Rule priority conflicts
- [x] Negation / exclusion / opt-out / unlimited
- [x] Contract generated and execution applied
- [x] Operation order invariants
- [x] Production-like dirty data
- [x] Multi-condition combinations
- [x] Security bypass mixed with normal input
- [x] State/history/retry/refresh behavior
- [x] Externally observable result, not only implementation detail

## Runtime Verification Route

- Runtime smoke: REQUIRED
- Black-box QA: REQUIRED
- Safe environment or localhost command: localhost Vite + Core, temporary fake executable under `/tmp`.
- Safe test account / mock access: not needed.
- Forbidden or destructive actions: no project cwd, no Git mutation, no arbitrary shell strings, no credential/env echo.

## [x] 【function 邏輯】valid custom executable probe uses safe execution
**範例輸入**：temporary executable path, display name `Local Test Agent`, probe arg `--version`。
**期待輸出**：probe returns `connected`, version summary is short, `execFile` receives `shell:false`, safe cwd, timeout, and allowed args only。

## [x] 【安全繞過】shell-looking input is rejected before execution
**範例輸入**：`/tmp/fake; rm -rf /` or `echo hello` as executable path。
**期待輸出**：validation error; no `execFile` call; no settings write。

## [x] 【Mock API】custom agent save probes before persistence
**範例輸入**：`POST /api/agents/custom` with a fake executable。
**期待輸出**：HTTP 200 includes saved custom agent; `GET /api/settings` includes it after reload。

## [x] 【Mock API】failed probe is not persisted
**範例輸入**：missing executable or fake executable that exits non-zero。
**期待輸出**：HTTP 400 or failed status; `custom_agents` remains unchanged。

## [x] 【Mock API】custom agent enable/disable/remove persists
**範例輸入**：PATCH enabled false, then DELETE the custom id。
**期待輸出**：settings snapshot updates; canonical agents remain present。

## [x] 【前端元素】wizard uses Core probe/save states
**範例輸入**：open CLI Agents, add custom path, run probe/save。
**期待輸出**：step 3 shows probing/failure/success state; save only appears after successful probe; card appears from settings snapshot。

## [x] 【RWD】CLI Agents page and wizard remain usable on desktop/mobile
**範例輸入**：desktop and mobile viewport screenshots。
**期待輸出**：no overlap, clipped text, or unusable controls。

## [x] 【實機 GUI】Grok CLI 透過新增 Agent wizard 完成連線與保存
**範例輸入**：local executable `~/.local/bin/grok`、probe arg `--version`。
**期待輸出**：wizard 顯示 `連線測試成功` 與版本摘要；完成後 CLI Agents card 顯示 `Connected` / `可用`，reload 後仍存在，且 custom probe API 回 200。
