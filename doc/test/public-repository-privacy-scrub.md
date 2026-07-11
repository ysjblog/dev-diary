# Public Repository Privacy Scrub Test Plan

## Test Depth Route

- Level: 3
- Reason: 公開 repository snapshot 會改動 Core project-root default、Tauri identifier、LaunchAgent label、mock paths 與文件，必須同時防止目前內容與即將 push 歷史洩漏。
- Required verification: current-tree personal path scan、runtime config regression tests、Core typecheck、root tests/build、snapshot branch ancestry check、remote push check。
- Allowed skips: 不讀取真實 project logs、不使用真實使用者資料、無須 UI interaction change 的新 RWD screenshot。

## Bug Pattern Coverage

- [x] Input normalization / aliases / format variants: project roots 只從冒號分隔的 `DEVDIARY_PROJECT_ROOTS` 解析。
- [x] Boundary values / empty / null / malformed input: persistent 與 `:memory:` runtime 都在未設定 roots 時回傳空陣列。
- [x] Rule priority conflicts: explicit env roots 優先，沒有 repository-local fallback。
- [x] Contract generated and execution applied: Core startup 使用 `resolveRuntimeConfig()` 的空 roots contract。
- [x] Operation order invariants: 公開 snapshot 以 `origin/main` 為 base，避免推送本機 private history。
- [x] Production-like dirty data: 全部 tracked files 不含個人絕對路徑或舊 LaunchAgent identifier。
- [x] Security bypass mixed with normal input: package／workflow 不引入 secret、certificate 或本機 path。
- [x] State/history/retry/refresh behavior: remote `main` 不被 force-push，公開 snapshot 以 fast-forward 推送。
- [x] Externally observable result, not only implementation detail: GitHub `main` 可快轉到已清理的 snapshot。

## Runtime Verification Route

- Runtime smoke: REQUIRED
- Black-box QA: NOT_APPLICABLE；變更的是 startup config 與公開 repository metadata，沒有新的 UI interaction。
- Safe environment or localhost command: test-only `:memory:` Core config 與本機 build。
- Safe test account / mock access: 不使用帳號或外部資料。
- Forbidden or destructive actions: 不 force-push、不改寫 GitHub 已存在 history、不把本機 paths、secrets 或 credentials 推送。

## [x] 【回歸】未設定 project roots 不掃描任何路徑
**範例輸入**：`resolveRuntimeConfig({ DEVDIARY_DB: ':memory:' })`。
**期待輸出**：`projectRoots` 為 `[]`。

## [x] 【回歸】明確 project roots 可正確解析
**範例輸入**：`DEVDIARY_PROJECT_ROOTS='/tmp/projects-a:/tmp/projects-b'`。
**期待輸出**：依序回傳兩個設定值。

## [x] 【安全】公開 snapshot 不含個人本機資訊
**範例輸入**：掃描 current tree 與即將推送的 commits。
**期待輸出**：沒有任何開發者私有絕對路徑或已淘汰的 private LaunchAgent identifier。

## [x] 【整合】snapshot 快轉推送
**範例輸入**：以 `origin/main` 建立 sanitized branch。
**期待輸出**：`git push origin <branch>:main` 是 fast-forward，且公開歷史不包含 private local commits。
