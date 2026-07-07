> 狀態：初始為 [ ]、完成為 [x]
> 注意：狀態只能在測試通過後由流程更新。
> 範圍：Projects Workspace Git Status 分頁改吃 Core read-only `GitStatusSnapshot`（spec §11）。

## Test Depth Route

- Level: 3
- Reason: 跨 Core service、API snapshot、React UI render，且 Core 會執行本機 `git` shell-adjacent read-only command；需驗證 contract、錯誤邊界與不修改 repo。
- Required verification: core git status unit/integration tests、core full `npm test`、`npm run typecheck`、UI `npm run build`、API smoke、desktop/mobile UI screenshot。
- Allowed skips: Git 寫入/cleanup/commit/push/merge/reset 全部為 v1 Non-Goal；不測 production remote 狀態，僅測 local repo snapshot 與 safe missing/upstream fallback。

## Runtime Verification Route

- Runtime smoke: REQUIRED（Core + Vite，切到 Workspace Git tab，確認資料由 `/api/projects/:id` 的 `git_status` render）
- Black-box QA: REQUIRED（Level 3 外部可觀察；若 subagent/tool 不可用，主 Agent 做獨立黑箱 pass 並記錄 fallback）
- Safe environment or localhost command: `DEVDIARY_PORT=4317 npm run dev` in `core/` + Vite `npm run dev -- --host 127.0.0.1 --port 5174 --strictPort`
- Safe test account / mock access: 使用 seeded local DB 與臨時 Git repo fixture，不碰 production 資料。
- Forbidden or destructive actions: 禁止 commit、merge、push、pull、reset、checkout、clean、branch delete、worktree remove、任何 project file 寫入。

## Bug Pattern Coverage

- [x] Input normalization / aliases / format variants（`:id` 非數字仍 400；Git branch/upstream 缺失 fallback）
- [x] Boundary values / empty / null / malformed input（missing root、非 Git repo、ignored project）
- [x] Rule priority conflicts（DB project ignored/not found 優先於 Git reader）
- [x] Negation / exclusion / opt-out / unlimited（ignored project 不回 git status）
- [x] Contract generated and execution applied（Core `git_status` 欄位被 UI Git tab 使用，移除 prototype fallback）
- [x] Operation order invariants（先驗證 id/project，再執行 Git reader；只走 read-only Git commands）
- [x] Production-like dirty data（no upstream、missing main fallback、working tree dirty）
- [x] Multi-condition combinations（dirty tree + linked worktree + diff summary）
- [x] Security bypass mixed with normal input（root path 以 argv 傳給 `git -C`，不經 shell，不可 command injection）
- [x] State/history/retry/refresh behavior（snapshot 重跑不改變 `.git` state）
- [x] Externally observable result, not only implementation detail（API JSON + UI Git tab render）

## Runtime 驗證結果

- **自動測試**: core 37/37 passed（含 Git Status 5 案例）、typecheck clean、UI build OK。
- **API smoke: PASS** — `http://localhost:4317/api/projects/1` 與 `http://localhost:5174/api/projects/1` 均回 `git_status`，branch=`feature/core-engine`，invalid id `abc→400`，missing `9999→404`。
- **Security review: PASS** — Git reader 使用 `spawnSync('git', ['-C', root, ...args])`，不經 shell；測試覆蓋含 metacharacter 路徑與 `.git/HEAD` / working tree 前後一致。
- **Smoke result: PASS** — Playwright 載入 `http://localhost:5174`，切到 Workspace → Git tab，畫面顯示 Core API snapshot：branch、working tree、worktree、diff、commit graph。
- **Black-box QA result: PASS（main-agent fallback）** — Fallback reason: 本 session 未派 subagent；改由主 Agent 用 Playwright CLI 做獨立操作 pass，不讀 implementation 結論，從 UI 行為與 API response 驗證。
- **RWD result: PASS** — desktop 與 mobile viewport 皆用 Playwright CLI 實測；hook 截圖保存於 `/tmp/codex-ui-shot-df89aa9b86f2.png`（>1KB）並完成 `/tmp/codex-ui-verified-df89aa9b86f2`。驗證中發現 mobile tab content 被壓縮/點擊攔截，已修 `src/index.css` mobile workspace scroll layout 後重測通過。

## [x] 【function 邏輯】getGitStatusSnapshot 對正常 Git repo 回傳 canonical snapshot
**範例輸入**：臨時 repo 初始化 main、建立 commit、修改/新增檔案後呼叫 Git reader。
**期待輸出**：含 project_id/captured_at/main_branch/current_branch/branch_relationship/working_tree_status/linked_worktrees/upstream_health/recent_commits/diff_*；recent commit hash/title 正確，diff lines > 0。

## [x] 【安全繞過】Git reader 只執行 read-only allowlist 且不經 shell
**範例輸入**：root_path 含 shell metacharacter 字元的資料夾名，建立合法 Git repo 後呼叫 Git reader。
**期待輸出**：snapshot 正常或安全 unavailable；不執行額外 shell 字串，repo 檔案未被意外新增/刪除。

## [x] 【資料邊界】missing root / 非 Git repo 回傳 unavailable snapshot，不 crash
**範例輸入**：不存在路徑、一般資料夾路徑。
**期待輸出**：`available=false`，branch/diff/commits/worktrees 使用安全空值，API 仍 200。

## [x] 【Mock API】GET /api/projects/:id snapshot 包含 git_status；invalid/not found 不跑 Git
**範例輸入**：`/api/projects/1`、`/api/projects/abc`、`/api/projects/9999`。
**期待輸出**：1 → 200 且有 `git_status.project_id===1`；abc → 400；9999 → 404；invalid/not found 不觸發 Git reader。

## [x] 【狀態回歸】Git status snapshot 不修改 repo state
**範例輸入**：呼叫 Git reader 前後比對 `git status --porcelain=v1` 與 `.git/HEAD`。
**期待輸出**：前後完全相同；不新增 commit、不改 branch、不改 working tree。

## [x] 【前端元素】Git tab 使用 Core `git_status` 而非 `GIT_STATUS_BY_PROJECT`
**範例輸入**：載入 Workspace，切到 Git Status tab。
**期待輸出**：畫面顯示 API snapshot 的 branch/working tree/commits/diff；App.jsx 不再引用 prototype `GIT_STATUS_BY_PROJECT`。

## [x] 【整合流程】Runtime smoke 經 Core + Vite proxy 取得 Git snapshot 並渲染
**範例輸入**：啟動 Core 4317 + Vite 5174，透過 `/api/projects/1` 與 UI Git tab 驗證。
**期待輸出**：API JSON 有 `git_status`；UI Git tab 顯示 read-only Git metadata，Console/API 無錯誤。

## [x] 【RWD】Git Status desktop/mobile 截圖無重疊破版
**範例輸入**：desktop 與 mobile viewport 開啟 Workspace Git tab。
**期待輸出**：Repository status、worktree list、diff stat、commit graph 文字不互相重疊，截圖檔 > 1KB。
