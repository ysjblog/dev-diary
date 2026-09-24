# QA Black-Box Report

- Environment: macOS；暫存 Codex root、假 UUID、暫存 SQLite DB、暫存 loopback Core API；Node `/Applications/DevDiary.app/Contents/Resources/core/node/bin/node` 22.23.1；timezone `Asia/Taipei`
- Revision / HEAD SHA: `6d55c34224518e1fdfc4748851808ee77acc2ae8`（工作樹含尚未提交的本次修復；下列檔案雜湊綁定受測內容）
- Timestamp: 2026-09-12T18:10:12Z
- Target URL / public entry: 隨機 loopback port 的 `POST /api/codex/desktop-resume/targets`
- Test depth: Level 3；runtime smoke + independent black-box QA
- Owner / QA Worker identity: Owner `/root`；QA Worker `/root/session_lookup_qa`
- Independence method: 不修改產品程式；以獨立 Node 行程從公開定位函式與 HTTP API 邊界操作全新暫存資料
- Bounded lens used: session identity 定位、正式資料位置邊界、重複身分拒絕、專用註冊 API 持久化、零 Codex dispatch
- Result: PASS

## Scenarios

- [PASS] 在 `sessions/target.jsonl` 放唯一正式 session；同一 Codex root 另放 14 層 `.tmp`、14 層 `plugins` 與 `memories/copy.jsonl`。期待無關深目錄與副本不影響定位；實際回傳 `r0/sessions/target.jsonl`。
- [PASS] 在 `sessions` 與 `archived_sessions` 各放相同假 UUID。期待拒絕；實際拋出 `duplicate_codex_session_identity`，未進入註冊。
- [PASS] 移除重複檔後，向暫存 loopback Core 的專用 targets API 送出 deep link。期待 HTTP 成功且寫入暫存 DB；實際 HTTP 200，專用 targets 表精確找到 1 筆，locator 為 `r0/sessions/target.jsonl`。
- [PASS] 暫存 `PATH` 只提供會留下收據的假 `codex` executable。期待註冊不呼叫 Codex；實際 API 完成後收據不存在。

## Evidence

- Screenshots: 不適用；此修復沒有 UI，測試入口為公開函式與 loopback HTTP API。
- Commands / artifacts: 使用安裝版 bundled Node 搭配 `--import tsx --input-type=module` 執行一次性 stdin QA harness；harness 建立並於結束時刪除所有暫存 root、DB、假 executable 與收據。去識別輸出：Node 22.23.1、Asia/Taipei、四個情境皆 `PASS`、locator `r0/sessions/target.jsonl`、duplicate error `duplicate_codex_session_identity`、API status 200、persisted rows 1、fake Codex receipt exists false、overall PASS。
- Source digests: `codexDesktopSessionLookup.ts` `a8ac8154aa3fb7277d2bb3b1d63546cfaf9f4da536e61a8f03a8c4f2dc869cb5`；`server.ts` `3368f8552e7f4c99730e85b8f163a2af9818699f3aeb0799747060937e3a8f07`；`db/index.ts` `a8828e0c74ad8112420bd3981d413861a128a088e1e59665394a9f31c76bcf04`。
- Console errors: 無。
- Network/API errors: 無。

## Findings

- Severity: 無阻塞或非阻塞 finding。
- Reproduction steps: 不適用。
- Expected: 四個指定情境全部符合 fail-closed 定位與安全註冊契約。
- Actual: 四個指定情境全部通過。

## Residual Risk

- 這次獨立 QA 只覆蓋指定的 session lookup 與專用註冊 API，不代表整個 Codex Desktop 自動續跑功能已完成驗證。
- 依禁止事項未啟動真正 Codex、未送出續跑命令，也未驗證實際 Codex Desktop 任務後續狀態。
- HEAD 本身早於工作樹修復，因此除 HEAD SHA 外，以三個受測來源檔 SHA-256 綁定本次證據；後續若檔案內容改變，必須重跑。
