# QA Black-Box Report

- Environment: local Core `http://127.0.0.1:4328`
- Revision / HEAD SHA: `90471a7` + working tree changes
- Timestamp: 2026-06-30 08:43 Asia/Taipei
- Target URL / public entry: `POST /api/projects/1/summary/regenerate`
- Test depth: Level 3, Runtime smoke REQUIRED, Black-box QA REQUIRED
- Subagent attempt: skipped
- Subagents used: none
- Fallback reason: subagent tool policy disallows spawning unless the user explicitly asks for subagents; main agent performed a separate black-box API/browser pass.
- Result: PASS

## Scenarios

- [PASS] Antigravity CLI availability smoke. Steps: run `agy --model 'Gemini 3.5 Flash (Medium)' --print-timeout 20s --print ...` from the temp runner cwd. Expected: one-shot print mode responds without login prompt. Actual: returned a short Traditional Chinese smoke response in about 4.5 seconds.
- [PASS] Node default `execFile` regression. Steps: run `core/test/diaryAgent.test.ts` with a fake CLI that waits for stdin EOF before printing. Expected: default exec closes stdin and returns Markdown before timeout. Actual: test passed in the default exec hot path.
- [PASS] Direct Core diary agent smoke. Steps: run `createAntigravityProjectDiaryAgent({ execTimeoutMs: 30000, printTimeout: '20s' })` against seeded project detail. Expected: `agent_id=antigravity-cli`, Markdown draft, no fallback reason. Actual: returned Markdown in about 8.8 seconds with no fallback reason.
- [PASS] Core summary regenerate API uses real Antigravity output. Steps: start local Core on port 4328 with in-memory DB, set `default_diary_agent=antigravity-cli`, call `POST /api/projects/1/summary/regenerate?range=all`. Expected: HTTP 200 with real Markdown draft, no `Fallback reason`, no raw command leakage. Actual: HTTP 200 in about 6.5 seconds, AI draft written, no `Fallback reason`, no `Command failed:`.
- [PASS] Dashboard chart regression scope. Steps: no UI files changed in this fix; rely on previous same-slice RWD screenshots. Expected: no new UI verification needed for Core-only subprocess change. Actual: not rerun.

## Evidence

- Screenshots:
  - Not applicable for this Core-only fix; no UI files changed.
- Commands / artifacts:
  - direct `agy --print` smoke
  - direct Core diary agent smoke via `npx tsx`
  - local Core API smoke on `http://127.0.0.1:4328`
  - `cd core && npm test`
  - `cd core && npm run typecheck`
  - `npm test`
  - `npm run build`
  - `git diff --check`
- Console errors: not applicable; browser was not part of this Core-only fix.
- Network/API errors: none for Core API smoke.

## Findings

- Severity: none.
- Reproduction steps: none remaining for this fix.
- Expected: Node `execFile` Antigravity print mode returns real Markdown before timeout.
- Actual: real Core agent and API smoke both returned Antigravity Markdown before timeout.

## Residual Risk

- The fix proves Workspace summary regenerate can get real Antigravity output through Node `execFile` in the current local runtime.
- Scheduler-grade reliability is still a future slice because the global daily scheduler has not been implemented yet.

## 2026-07-15 Addendum: Claude/Codex Diary Runtime and Grok GUI

- Environment: macOS local safe runtime；Core `127.0.0.1:4340` + Vite `127.0.0.1:5188`，isolated SQLite `/tmp/devdiary-gui-grok.sqlite`
- Revision / HEAD SHA: `d1e866f8315f6e523b9eb74334140ab8e789660e` plus current working-tree diary-agent runtime fix
- Timestamp: 2026-07-15 22:42 +0800
- Target URL / public entry: `http://127.0.0.1:5188/`
- Test depth: Level 3；Runtime smoke + Black-box QA
- Subagent attempt: PASS
- Subagents used: 1 read-only Sol QA reviewer
- Fallback reason: none；browser surface 沒有 Network inspector，因此另以 endpoint-level `curl` 補充 HTTP evidence
- Result: PASS

### Scenarios

- [PASS] Dashboard page title 為 `DevDiary — AI Coding Cockpit` 且核心頁可渲染。
- [PASS] CLI Agents 頁面中 Claude Code 與 Codex CLI 顯示 `Connected`／`可用`。
- [PASS] 以新增 Agent wizard 加入本機 Grok CLI；成功訊息顯示版本摘要，完成後 Grok card 顯示 `Connected`／`可用`。
- [PASS] Reload 後 Grok CLI card 仍存在且維持 `Connected`／`可用`。
- [PASS] Default diary agent 的 Grok option 顯示 disabled／`尚未支援 Diary Agent`；這是目前 custom CLI contract 的產品限制，不是 Grok connection failure。
- [PASS] Desktop 1440x1000 與 mobile 390x844 screenshot 均無明顯 overlap、clipping 或不可用控制項。
- [PASS] Console error/warning 為 0。
- [PASS] `/api/health`、`/api/settings`、`/api/agents/detect` 皆回 HTTP 200；response body 未輸出。

### Evidence

- Screenshots: `/tmp/devdiary-qa/cli-agents-desktop.png`、`/tmp/devdiary-qa/cli-agents-mobile.png`
- UI hook verification: `/tmp/codex-ui-shot-df89aa9b86f2.png` + `/tmp/codex-ui-verified-df89aa9b86f2`
- Grok persisted settings: `status=connected`、`enabled=true`、`model=custom`、version summary `grok 0.2.99 (b1b49ccb71a7)`、error null
- Browser request history: settings/detect/custom probe/custom save and page data requests all observed as HTTP 200
- Commands / artifacts: Core 23 test files／221 tests、Core typecheck、UI 66 tests、Vite production build、`git diff --check`
- Console errors: 0；React DevTools info message only
- Network/API errors: none observed；subagent independently confirmed the three endpoint HTTP checks with `curl -o /dev/null`

### Findings

- Severity: none
- Reproduction steps: CLI Agents → 新增 Agent → 自訂 Custom CLI → `/path/to/custom-agent` → `--version` → 連線測試 → 完成新增 → reload
- Expected: successful probe, persisted custom agent, reload-safe Connected card
- Actual: exactly matched expected behavior

### Residual Risk

- Grok CLI is connected as a custom Agent, but the current UI contract does not allow custom CLI agents to become the Diary Agent；只有 canonical agents 與 local Ollama custom provider 可被選為 Diary Agent。
- Browser surface 沒有內建 Network inspector；本報告以 independent endpoint-level HTTP checks 補足，未宣稱 CDP-level browser request trace。
