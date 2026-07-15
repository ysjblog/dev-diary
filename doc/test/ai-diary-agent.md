# AI Diary Agent Test Plan

## Test Depth Route

- Level: 3
- Reason: 接入 external CLI subprocess、Core structured data package、SQLite summary draft persistence、localhost API 與 Dashboard UI layout。
- Required verification: Core unit/integration tests、Core typecheck、UI API tests、Build、API smoke、desktop/mobile browser screenshot。
- Allowed skips: 不讀 raw transcript、不讀 project files；真實 Antigravity auth 若不可用，CLI runtime smoke 可記錄為 fallback path。

## Bug Pattern Coverage

- [x] Input normalization / aliases / format variants：Settings default agent 以 canonical `antigravity-cli` 判斷。
- [x] Boundary values / empty / null / malformed input：空 CLI output、CLI failure、missing/default agent。
- [x] Rule priority conflicts：user override 仍優先於新的 AI draft。
- [x] Negation / exclusion / opt-out / unlimited：disabled Antigravity agent 不執行 CLI。
- [x] Contract generated and execution applied：Core structured package 真的進入 diary agent，產物寫回 `project_summaries.markdown_ai`。
- [x] Operation order invariants：先取得 snapshot，再產生 draft，最後才寫 DB；失敗時寫 fallback，不留下 partial mutation。
- [x] Production-like dirty data：不把 project root、source log ref、raw transcript 或 credentials 放進 prompt。
- [x] Multi-condition combinations：default agent + enabled flags + injected test agent + API route。
- [x] Security bypass mixed with normal input：使用 `execFile` argv，不使用 shell command string。
- [x] State/history/retry/refresh behavior：重跑 regenerate 更新 draft，但不覆蓋 user override。
- [x] Externally observable result, not only implementation detail：`POST /api/projects/:id/summary/regenerate` 回傳可見 AI draft。

## Runtime Verification Route

- Runtime smoke: REQUIRED
- Black-box QA: REQUIRED
- Safe environment or localhost command: local Core API + Vite UI；Antigravity CLI 只用 non-mutating `--print`，cwd 在 temp folder。
- Safe test account / mock access: unit tests inject fake diary agent；live smoke 可使用 fallback if `agy` auth unavailable。
- Forbidden or destructive actions: 不修改 project folder、不傳 raw transcript、不輸出 secrets、不用 shell。

## [x] 【function 邏輯】Antigravity diary agent 用 structured package 呼叫 `agy --print`
**範例輸入**：selected project snapshot + fake `execFile`。  
**期待輸出**：args 包含 `--model`、`--print-timeout`、`--print`；prompt 不含 project root；cwd 不等於 project root；回傳 Markdown draft。

## [x] 【整合流程】Node default `execFile` 關閉 stdin，讓 `agy --print` 不再等待 EOF
**範例輸入**：會等到 stdin EOF 才輸出 Markdown 的 fake CLI。
**期待輸出**：default exec hot path 在 timeout 前回傳 Markdown；仍使用 argv、temp cwd、`shell:false`。

## [x] 【錯誤處理】Antigravity 未登入、逾時、空輸出時寫 deterministic fallback
**範例輸入**：fake agent throw auth / empty output。  
**期待輸出**：API 不 500；`summary_ai_draft_markdown` 有 fallback draft，且 user override 仍保留。

## [x] 【安全繞過】Diary prompt 不含 project raw paths、source log ref、raw transcript 或 credential-like keys
**範例輸入**：snapshot sessions 含 source refs / root path。  
**期待輸出**：built prompt 不含這些敏感欄位，只含聚合 metrics 與 session metadata。

## [x] 【Mock API】summary regenerate endpoint 可透過 injected agent 寫入 AI draft
**範例輸入**：`POST /api/projects/1/summary/regenerate`。  
**期待輸出**：HTTP 200；body 保留 selected range；AI draft 是 injected agent output。

## [x] 【狀態回歸】user override 不會被 AI regenerate 覆蓋
**範例輸入**：先保存 manual summary，再 regenerate。  
**期待輸出**：`summary_source=user`，`summary_markdown` 仍是 manual；`summary_ai_draft_markdown` 更新。

## [x] 【RWD】Dashboard trend chart 底線貼齊 chart panel 可用下緣
**範例輸入**：desktop/mobile Dashboard all-time。  
**期待輸出**：chart SVG 填滿 panel 的剩餘高度，折線圖 baseline 與外框下緣視覺對齊，不被 legend 撐出大空坑。

## [x] 【整合流程】Claude Code Diary Agent 在 safe subprocess env 下產生 Markdown
**範例輸入**：enabled `claude-code`、default diary agent、real local `claude -p` print mode。
**期待輸出**：實際回傳 `agent_id=claude-code` 的 Markdown，不走 fallback；只傳遞必要的非 secret runtime env，不把完整 parent env 或 project cwd 帶入 child。

## [x] 【環境解析】Claude GUI app bundle 不被當成 Claude Code CLI
**範例輸入**：PATH 中有可執行的 Claude CLI，系統同時存在 `/Applications/Claude.app/Contents/MacOS/claude`。
**期待輸出**：resolver 選 PATH CLI；不把 GUI bundle 傳給 `claude -p`，避免空輸出、GUI lock 或 100 秒 timeout。

## [x] 【整合流程】Codex CLI Diary Agent 使用 read-only trusted-boundary bypass
**範例輸入**：enabled `codex-cli`、default diary agent、real local `codex exec`。
**期待輸出**：實際回傳 `agent_id=codex-cli` 的 Markdown；argv 保留 `--sandbox read-only`、`--ephemeral`、temporary cwd，並加上 `--skip-git-repo-check` 以支援非 Git temp cwd。

## [x] 【安全繞過】Canonical Diary Agent 不洩漏 secrets 或 project path
**範例輸入**：parent env 含 credential-like variables、project snapshot 含 root path/source ref。
**期待輸出**：child env 僅含 allowlisted non-secret values；prompt 不含 raw project path/source ref；錯誤 fallback 不保存 CLI stderr、argv 或 token。
