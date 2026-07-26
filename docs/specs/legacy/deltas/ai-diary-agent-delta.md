# Delta Spec: AI Diary Agent And Antigravity Project Summary

> PR: feature/core-engine
> Date: 2026-06-30
> Status: merged

## 新增（Added）

- Core AI Diary Agent service：從 selected project `ProjectDetailSnapshot` 建立 structured data package，產生 project diary / summary draft。
- Antigravity CLI adapter：當 Settings 的 `default_diary_agent` 是 `antigravity-cli` 且該 agent enabled 時，Core 以 `agy --print` 呼叫 Antigravity CLI。
- Deterministic fallback：Antigravity CLI 不存在、未登入、逾時、空輸出或 disabled 時，仍產生 deterministic fallback draft，不阻斷 Workspace。
- Security boundary：Diary Agent 不讀 project files、不讀 raw transcripts、不持久化 prompt、不透過 shell 執行 CLI。
- Runtime timeout guard：Antigravity project summary generation 預設 100s timeout / 90s print timeout，避免 UI regenerate 無限等待。
- Node subprocess stdin EOF handling：Core default `execFile` hot path 會關閉 child stdin，避免 `agy --print` 等待 stdin EOF 而逾時。
- Canonical CLI runtime hardening：Claude Code resolver 不再把 `/Applications/Claude.app` 的 desktop GUI launcher 當成 print-mode CLI；Codex read-only subprocess 加上 `--skip-git-repo-check`，允許在 temporary non-Git cwd 執行。
- Safe subprocess environment：Diary Agent child process 只保留既有 allowlist 與非 secret 的 `USER`、`TERM`、`SHELL`，保留 Claude Code 本機 session 可用性但不傳完整 parent env。

## 修改（Changed）

- Workspace summary regenerate endpoint 從 deterministic-only draft 升級為 agent-backed draft with fallback。
- `createServer` 可注入 test diary agent，讓 API tests 不需要真實 Antigravity auth。
- Dashboard trend chart layout 調整為 SVG 填滿 panel 剩餘高度，baseline 對齊 chart panel 下緣。

## 移除（Removed）

- 無。

## 影響範圍（Impact）

- 受影響模組：Core diary agent service, project summary write path, Express route, settings/default agent behavior, Core tests, Dashboard chart CSS, specs, doc/test。
- MASTER.md 需更新：AI Diary Agent 狀態、prototype-only 行為、Open Questions、delta index。

## 驗收條件

- [x] Settings default diary agent 為 enabled `antigravity-cli` 時，summary regenerate 會嘗試使用 `agy --print` 產生 AI draft。
- [x] Antigravity CLI 失敗或 disabled 時，API 回 200 並寫入 deterministic fallback draft。
- [x] Diary prompt 不包含 project root path、source log ref、raw transcript 或 credential-like fields。
- [x] 本機 Claude Code 與 Codex CLI print-mode 都能在 safe subprocess env 下實際產生 Markdown，且不走 fallback。
- [x] Claude GUI app bundle 不會被 resolver 當成 Claude Code CLI。
- [x] Codex CLI 實際使用 read-only、ephemeral、temporary cwd 與 `--skip-git-repo-check`。
- [x] Summary regenerate 不覆蓋 user override，必須經 accept draft 才成為 active summary。
- [x] Dashboard trend chart baseline 在 desktop/mobile 都貼齊 panel 下緣，無明顯底部空坑。

## 已知限制（Known Limitation）

- Live direct shell `agy --print` 與 Core Node `execFile` hot path 目前都可產生 Markdown diary；safe fallback 仍保留，用於 CLI 未登入、失敗、逾時或空輸出。
