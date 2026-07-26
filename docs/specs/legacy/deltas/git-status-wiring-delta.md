# Delta: Workspace Git Status Live API Wiring

> Feature: Projects Workspace Git Status 分頁由 prototype mock 改接 Core read-only `GitStatusSnapshot`
> Base spec: `docs/specs/dev-diary-macos-app.md`（§7.8, §11, §16）
> Branch: `feature/core-engine`
> Date: 2026-06-29
> Status: implemented

## 新增 (Added)

- `core/src/services/gitStatus.ts`：read-only Git snapshot service。
  - 只用 `git -C <root>` argv 方式呼叫固定 inspection commands，不經 shell。
  - 支援 missing root / 非 Git repo fallback：回 `available=false`，API 不 crash。
  - 回傳 main branch、current branch、branch relationship、working tree status、linked worktrees、upstream health、recent commits、diff line summary。
- `GitStatusSnapshot` / `GitLinkedWorktree` / `GitRecentCommit` canonical types。
- `ProjectDetailSnapshot.git_status`：`GET /api/projects/:id` 直接帶回 selected project 的 Git snapshot。
- `core/test/gitStatus.test.ts`：5 個案例覆蓋正常 repo、shell metacharacter path、不經 shell、missing/non-git fallback、API snapshot、不修改 `.git` state。
- `doc/test/git-status-workspace-wiring.md`：Level 3 測試計畫與驗證紀錄。

## 修改 (Modified)

- `core/src/services/projects.ts`：在 project 存在且未 ignored 後才執行 Git reader；不存在 / ignored 仍回 404，不觸發 Git snapshot。
- `core/test/projects.test.ts`：Project detail snapshot 形狀加入 `git_status`，deterministic 比對排除 nested `captured_at`。
- `src/api/projects.js`：新增 `toGitStatusView` mapper；註解更新為 Git Status 已由 Core snapshot 提供。
- `src/App.jsx`：Git tab 改用 `projectDetail.git_status` render，移除 `GIT_STATUS_BY_PROJECT` prototype mock。

## 安全邊界

- 不執行 commit、merge、push、pull、reset、checkout、clean、branch delete、worktree remove 或任何 mutating Git command。
- `root_path` 只作為 `git -C` 的 argv 參數，不拼接 shell command string。
- 每次 Git command 有 timeout 與 output limit；missing/non-git path 回安全空 snapshot。
- Git Status 是 read-only UI；React 不直接執行 shell command。

## 尚未實作（後續 delta）

- Workspace 寫入路徑：留言 CRUD、Kanban 拖拉持久化、摘要儲存 / AI regenerate 走 Core POST endpoint（含 `DiaryEntry.markdown_user` override）。
- Dashboard / Workspace range state 拆分（spec §15.19；目前 Workspace 顯示 all-time）。
- 手動 Scan Now / 重新掃描走 idempotent Core scan endpoint（spec §5.2）。
- Agents、Settings 接 Core API。
