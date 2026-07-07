# Test Plan: Antigravity CLI And Project Root Scan

## Test Depth Route

- Level: 4
- Reason: 變更 project discovery、parser、persistence、API smoke 與本機 filesystem / external CLI log surface，屬於 cross-module + natural-language/log parsing + persistence path。
- Required verification: doc/test cases, unit/integration tests, runtime API smoke, security source-to-sink review, build/typecheck/diff review。
- Allowed skips: UI/RWD 截圖可略過，前提是本切片不修改 React UI / CSS / browser interaction。

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
- Safe environment or localhost command: local Core API bound to `127.0.0.1`, test SQLite under `/tmp` or `:memory:`
- Safe test account / mock access: no external account required; parser reads local Antigravity metadata/logs only
- Forbidden or destructive actions: do not modify project folders, do not execute Antigravity prompts, do not persist raw transcript, do not print secrets

## [x] 【function 邏輯】Project root discovery 從 configured roots upsert git/project folders
**範例輸入**：temp root 內含 `Side App/.git` 與 `Plain App/package.json`。
**期待輸出**：`projects` 新增兩筆 root_path；重跑 discovery 不新增 duplicate。

## [x] 【function 邏輯】Project discovery 忽略 hidden/vendor folders 並維持 read-only
**範例輸入**：temp root 內含 `.hidden/.git`、`node_modules/pkg/package.json`、真實 repo。
**期待輸出**：只新增真實 repo；project folder 檔案列表與 Git HEAD 不改變。

## [x] 【function 邏輯】Antigravity CLI glog parser 讀 workspaceDirs / model / conversation
**範例輸入**：`~/.gemini/antigravity-cli/log/cli-YYYYMMDD_HHMMSS.log` 含 workspaceDirs、Print mode model、Created conversation。
**期待輸出**：產生 `agent_name=antigravity-cli`、model、start/end time、stable source_log_ref。

## [x] 【資料邊界】Antigravity transcript presence 強化時間但不持久化 raw content
**範例輸入**：`brain/<conversationId>/.system_generated/logs/transcript.jsonl` 含 content / thinking / tool_calls。
**期待輸出**：session summary / redacted_log_excerpt 不含 content、thinking 或 raw prompt。

## [x] 【整合流程】Global scan 先 discovery 再掃描 eligible projects
**範例輸入**：runManualScan global with projectRoots + Antigravity log provider。
**期待輸出**：新 discovered project 被掃描；第二次 scan 不新增 duplicate sessions。

## [x] 【Mock API】POST /api/scan 回傳 discovered projects 與 Antigravity scan records
**範例輸入**：local createServer with projectRoots + parser fixture homeDir。
**期待輸出**：HTTP 200；`projects` 包含 discovered project；`dashboard` / project detail 可見 `antigravity-cli` session。

## [x] 【安全繞過】Project roots 與 log metadata 不可導致 project folder write 或 shell execution
**範例輸入**：project path / conversation id 含 path-like dirty value。
**期待輸出**：source_log_ref 被正規化；不寫 project folder；不執行 `agy` 或其他 shell command。
