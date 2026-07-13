# Scan State, Diary Agents, And Project Docs Usability Test Cases

## Test Depth Route

- Level: 3
- Reason: Shared persisted scan state crosses manual API routes, background scheduling, React polling, local CLI execution, and document sorting/search.
- Required verification: Core regression/integration tests, UI API/source tests, Core typecheck, UI build/tests, security review, desktop/mobile runtime smoke, independent black-box QA, package smoke.
- Allowed skips: No real user project docs or credentials; adapters use fixtures and safe local runtime only.

## Bug Pattern Coverage

- [x] Boundary values / empty / null / malformed input — no prior scan, empty query, nested path and zero matching docs.
- [x] Contract generated and execution applied — scan-state writes change runner due calculation and UI spinner/timestamp.
- [x] Operation order invariants — scan completion persists before next due calculation; CLI adapter validates/resolves before execution.
- [x] Production-like dirty data — duplicate filenames under distinct directories, malformed timestamps/path separators, unavailable CLI.
- [x] State/history/retry/refresh behavior — manual scan during background wait, background start/finish, polling without dirty editor overwrite.
- [x] Externally observable result, not only implementation detail — actual local API, desktop and mobile UI flows.
- Security bypass mixed with normal input is not applicable: search never reaches shell/SQL/path sinks and is tested as local in-memory filtering.

## Runtime Verification Route

- Runtime smoke: REQUIRED
- Black-box QA: REQUIRED
- Safe environment or localhost command: existing DevDiary localhost runtime with fixture/safe local DB.
- Safe test account / mock access: local CLI discovery only; no credentials, project content, or destructive actions.
- Forbidden or destructive actions: no writes to user source logs, no credential changes, no production/remote service calls.

## [x] 【整合流程】任一 scan completion 成為下一輪 background 基準
**範例輸入**：background cycle 已排程後，manual global 或 project scan 成功／失敗完成。
**期待輸出**：`background_scan` 反映最後完成者；runner 的 next due 由該 timestamp + configured interval 推導。

## [x] 【狀態回歸】background running 狀態與 polling 不覆蓋 editor
**範例輸入**：background state 只有 `last_started_at`，再完成；Settings form/comment/diary 有未送出文字。
**期待輸出**：sidebar spinner 與時間更新；read-only merge 不重設任何 dirty input。

## [x] 【function 邏輯】Claude/Codex safe diary adapter
**範例輸入**：configured Claude 或 Codex canonical agent、fixture exec result、CLI failure。
**期待輸出**：fixed argv + `shell:false` + temporary cwd + allowlisted env 產生 Markdown；failure 回 fallback；Codex 被標為 supported 僅在 adapter 可用時。

## [x] 【前端元素】CLI path 與 folder icon
**範例輸入**：long resolved CLI path、desktop/mobile viewport。
**期待輸出**：Version/Binary path 不在 card top-level 重複；CLI executable detail path wraps；folder action 是可辨識 SVG。

## [x] 【整合流程】Docs path group、排序與搜尋
**範例輸入**：root `README.md`、`docs/specs/MASTER.md`、`docs/specs/deltas/a.md`，交錯 updated_at，query 匹配 filename 或 content。
**期待輸出**：newest first with stable name tiebreak; generic path groups; query narrows cards and clear restores all groups.

## [x] 【RWD】Workspace Docs desktop/mobile
**範例輸入**：Docs tab with long paths and matching search query at desktop/mobile widths。
**期待輸出**：search/group/card layout remains usable, no overlap or hidden path text.
