# CLI Log Parser Test Plan

## Test Depth Route

- Level: 3
- Reason: Parser 讀取本機 CLI logs，建立跨模組 contract，並寫入 SQLite sessions/token_usage/daily_logs；涉及 file path、dirty data、source identity 與 API runtime。
- Required verification: parser unit tests、scan integration tests、API smoke、Core typecheck、UI build、diff whitespace/security review。
- Allowed skips: Antigravity parser 只標 experimental，不在本切片宣稱 schema 已穩定；本切片不改 UI，新增 RWD 截圖可略過。

## Bug Pattern Coverage

- [x] Input normalization / aliases / format variants
- [x] Boundary values / empty / null / malformed input
- [ ] Rule priority conflicts
- [ ] Negation / exclusion / opt-out / unlimited（不適用：本切片無 opt-out 新流程，沿用 ignored / scan_paused 測試）
- [x] Contract generated and execution applied
- [x] Operation order invariants
- [x] Production-like dirty data
- [x] Multi-condition combinations
- [x] Security bypass mixed with normal input
- [x] State/history/retry/refresh behavior
- [x] Externally observable result, not only implementation detail

## Runtime Verification Route

- Runtime smoke: REQUIRED
- Black-box QA: OPTIONAL（Core-only parser provider，無新增 UI interaction；API smoke 覆蓋 externally observable contract）
- Safe environment or localhost command: temporary SQLite + fixture log roots only
- Safe test account / mock access: 不使用真實帳號；fixture logs 人工合成
- Forbidden or destructive actions: 不寫 project folder、不 shell out、不 commit fixture 以外的真實 logs、不輸出 secrets/raw transcript

## [x] 【function 邏輯】Claude Code JSONL parser 讀 sessionId / cwd / usage 並產生 stable source identity
**範例輸入**：fixture `~/.claude/projects/<escaped-project-path>/<session>.jsonl`，含 user / assistant usage lines。
**期待輸出**：一筆 `claude-code` session candidate；model、start/end、token_input/token_cached/token_output/token_total、source_log_ref 穩定且不含 raw project path。

## [x] 【function 邏輯】Codex CLI JSONL parser 讀 session_meta / turn_context 並產生低信心 session
**範例輸入**：fixture `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`，含 session_meta cwd/id/timestamp 與 turn_context model。
**期待輸出**：一筆 `codex-cli` session candidate；缺 usage 時 token 欄位為 0，source_log_ref 穩定。

## [x] 【錯誤處理】malformed / dirty JSONL line 不讓 parser crash
**範例輸入**：fixture 中混入 invalid JSON line 與缺欄位 assistant line。
**期待輸出**：scan 成功；malformed line 被略過並回傳 warning；有效 records 仍被寫入。

## [x] 【整合流程】CLI provider 接入 runManualScan 後 repeated scan 不重複新增資料
**範例輸入**：同一組 Claude / Codex fixture provider 連續跑兩次 global scan。
**期待輸出**：第一次新增 sessions/token_usage/daily_logs；第二次 inserted_sessions 為 0，token_usage 不重複累加。

## [x] 【Mock API】scan endpoint 使用 CLI provider 回傳 parsed records 與 refreshed snapshot
**範例輸入**：`createServer(db, { scanProvider })` 後 POST `/api/projects/1/scan`。
**期待輸出**：HTTP 200；scan.scanned_projects 含 project 1；project_detail.sessions 含 parsed `source_log_ref` 對應的 session。

## [x] 【安全繞過】parser 不寫 project folder、不執行 shell、不輸出 raw transcript
**範例輸入**：fixture project folder 是 Git repo，scan 前後比對 files、HEAD、status。
**期待輸出**：project folder 完全不變；只寫 SQLite app data；session summary / redacted excerpt 不包含 raw prompt transcript。
