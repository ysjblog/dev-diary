# QA Black-Box Report

- Environment: 目前 `DevDiary_0.1.4_aarch64.dmg` 的唯讀掛載內容；DMG 內 bundled Node 22.23.1、ICU 78.2、timezone data 2026a、系統時區 Asia/Taipei；暫存 session 與 SQLite DB；記憶體內 fake dispatcher
- Revision / HEAD SHA: `6d55c34224518e1fdfc4748851808ee77acc2ae8`（工作樹有尚未提交變更，另以來源雜湊與 DMG 雜湊綁定）
- Timestamp: 2026-09-13T01:47:14Z
- Target / public entry: DMG bundled Node 執行 DMG 內 session registration 與 resume engine 公開函式
- Test depth: Level 4；packaged runtime smoke + independent black-box QA
- Owner / QA Worker identity: Owner `/root`；QA Worker `/root/session_lookup_qa`
- Independence method: 不修改產品程式；使用 DMG 內 Node 與 Core 原始碼，所有可變資料均在暫存區
- Bounded lens used: bundled runtime authority、timezone mismatch 安全恢復、合法已到期 quota、其他 needs_attention 隔離、零真實 Codex
- Result: PASS

## Scenarios

- [PASS] DMG 內存在可執行的 `core/node/bin/node`，實際 runtime authority 為 `node=22.23.1;icu=78.2;tz=2026a`；同一 bundled Node 執行 DMG 內註冊函式後，registration authority 與 runtime authority 完全一致，timezone id 亦為 Asia/Taipei。打包執行檔含 bundled Node 與 Homebrew fallback 候選，來源 launcher 契約先選 bundled Node。
- [PASS] 先把已註冊 target 模擬為不同 ICU authority。第一次 tick 保持零 dispatch，target 進入 `needs_attention`，錯誤為 `timezone_authority_changed`。把 authority 恢復為精確註冊值並追加合法、已到期 quota evidence 後，下一次 tick 回傳 `resumed`，fake dispatcher 精確收到該假 UUID 一次；再 tick 回傳 `watching`，沒有重播。
- [PASS] 第二個 target 預先設為 `needs_attention`／`session_uniqueness_unproven`。完成前述時區恢復後，它仍維持同一狀態與錯誤，未被自動清除。
- [PASS] dispatcher 是行程內純記錄函式，整輪 `real_codex_invocations=0`，沒有啟動 CLI 或接觸真實 Codex task。

## Evidence

- DMG SHA-256: `c4bb7b9b3f43e647bc8a45d0812e64c478d1a9796c9bd02a57abfbb4ec2d6795`
- DMG size / mtime: 356,698,579 bytes；2026-09-13T09:36:45+08:00
- Source SHA-256: `core/src/services/codexDesktopResumeEngine.ts` = `816c87c68669f217e8392b5a87a1e85fff31fef50c9051fc4473cf442adb4d4a`；`core/src/services/codexDesktopSessionLookup.ts` = `a8ac8154aa3fb7277d2bb3b1d63546cfaf9f4da536e61a8f03a8c4f2dc869cb5`；`src-tauri/src/lib.rs` = `899ba5a0b72c4fe080a3a54ec8db4868ae073f75b6eb4b3dd6481fdd4a800bef`。
- Packaged/source parity: DMG 內 resume engine 與 session lookup 的 SHA-256 分別等於上述工作樹來源雜湊。
- 去識別 outcomes: `registration_matches_runtime=true`；`timezone_id_matches_runtime=true`；mismatch tick=`watching`；mismatch state=`needs_attention`；recovery tick=`resumed`；no-replay tick=`watching`；fake dispatch count=1；exact target=true；other error before/after=`session_uniqueness_unproven`；real Codex invocations=0；overall=PASS。
- Screenshots: 不適用；本次是 packaged Node 與背景 engine 的非 UI 路徑。
- Console / API errors: 無。

## Findings

- Severity: 無阻塞或非阻塞 finding。
- Expected: 只在精確 timezone authority 恢復且 quota evidence 合法到期時進行一次 fake dispatch；其餘人工檢查錯誤保持隔離。
- Actual: 符合期待。

## Residual Risk

- 依工作封包禁止事項，未安裝或啟動真實 LaunchAgent，也未向真實 Codex 任務送出續跑訊息。
- 本證據綁定上述 DMG 與來源雜湊；任何重打包或來源變更後都需重跑。
