# Persistent DB Runtime Test Plan

## Test Depth Route

- Level: 3
- Reason: Core startup now chooses a persistent SQLite database by default, and global scan depends on the runtime config contract between env vars, DB path, project root discovery, and API scan persistence.
- Required verification: runtime config tests, persistent SQLite integration test, API smoke with server restart, Core typecheck, root UI build, security review, diff review.
- Allowed skips: UI/RWD screenshots; this slice changes backend startup/config only and does not change React rendering.

## Bug Pattern Coverage

- [x] Input normalization / aliases / format variants: `DEVDIARY_PROJECT_ROOTS` trims whitespace and ignores empty `:` segments.
- [x] Boundary values / empty / null / malformed input: missing `DEVDIARY_DB` resolves to macOS app data SQLite path; missing project roots resolves to empty roots for persistent runtime.
- [x] Rule priority conflicts: explicit `DEVDIARY_DB=:memory:` keeps the dev preset roots, while default persistent DB does not.
- [x] Contract generated and execution applied: `resolveRuntimeConfig()` is consumed by `core/src/index.ts` startup.
- [x] Operation order invariants: Core creates the DB parent directory before opening SQLite, and discovery runs before global scan persistence.
- [x] Production-like dirty data: persistent runtime with no configured roots does not scan private local folders accidentally.
- [x] State/history/retry/refresh behavior: file-backed SQLite keeps discovered projects and parsed sessions after server restart.
- [x] Externally observable result, not only implementation detail: API smoke posts `/api/scan?range=all`, restarts the server, then reads `/api/projects`.
- [x] Security-sensitive local path handling: no API key/token/raw transcript content is written by this config layer; scan remains read-only for project folders.

Irrelevant rows: auth/payment/file upload/webhook are not touched in this slice.

## Runtime Verification Route

- Runtime smoke: REQUIRED
- Black-box QA: OPTIONAL
- Safe environment or localhost command: temporary SQLite path, fixture home roots, loopback Core API
- Safe test account / mock access: no external accounts; local fixture logs only
- Forbidden or destructive actions: do not write project folders, do not persist raw transcript/prompt/response/thinking, do not execute Antigravity or shell mutations

## [x] 【function 邏輯】未設定 DEVDIARY_DB 時預設使用 persistent macOS app data SQLite
**範例輸入**：`resolveRuntimeConfig({}, { homeDir: '/Users/devdiary-test' })`。
**期待輸出**：DB path 為 `/Users/devdiary-test/Library/Application Support/DevDiary/DevDiary.sqlite`，project roots 為空陣列。

## [x] 【資料邊界】persistent runtime 不自動套用私人本機 project roots
**範例輸入**：未設定 `DEVDIARY_PROJECT_ROOTS` 的 persistent runtime。
**期待輸出**：`projectRoots` 是 `[]`；只有明確設定 env 或使用 local preset script 才會掃 `~/Projects` 與 `~/Workspace/side-projects`。

## [x] 【狀態回歸】persistent SQLite restart 後保留 discovered projects 與 sessions
**範例輸入**：fixture project root + fixture Claude log，POST `/api/scan?range=all` 後關閉 server，重開同一 SQLite file。
**期待輸出**：`GET /api/projects` 仍看得到 discovered project，DB 中仍有 `claude-code://discovered-session`，第二次 scan 新增 0 sessions。

## [x] 【整合流程】local preset script 不需要手動記 DB path / project roots
**範例輸入**：`npm run start:local` 或 `npm run dev:local`。
**期待輸出**：Core 使用預設 persistent DB path，並由 script 明確帶入兩個本機 development scan roots。
