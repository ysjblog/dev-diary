# Codex 續跑時區執行環境修復

## 根因紀錄

- 症狀：註冊成功且全域／目標均啟用，但到期後沒有續跑。
- 實機證據：目標在註冊約 20 秒後進入 `needs_attention`，錯誤為 `timezone_authority_changed`，沒有 quota evidence、claim 或 dispatch。
- 根因：App Core 使用 bundled Node 22.23.1（ICU 78.2），LaunchAgent 背景程序優先使用 Homebrew Node 22.23.1（ICU 78.3）。
- 修復邊界：LaunchAgent 優先使用 `$CORE_DIR/node/bin/node`；若原註冊 authority 再度精確成立，僅自動清除尚未讀證據／未 dispatch 的 timezone mismatch 狀態。

## Test Depth Route

- Level: 4；這是額度事件觸發的外部續跑關鍵路徑，且已發生第二輪缺陷。
- Required verification: Rust 產生器測試、engine 狀態回歸、完整 Core/UI/Rust、打包 runtime smoke、安全與獨立黑箱 QA。
- Allowed skips: 不對真實 Codex 任務送出訊息；使用假 CLI。
- Runtime smoke: REQUIRED。
- Black-box QA: REQUIRED。

## Bug Pattern Coverage

- [x] 產生器內容確實由 LaunchAgent 執行，而非只測 resolver。
- [x] bundled 與 Homebrew Node 同版本但 ICU 不同時仍選 bundled。
- [x] authority 不符時維持 fail closed，不 dispatch。
- [x] authority 回復成註冊值時，只恢復該特定錯誤，保留其他 `needs_attention`。
- [x] 恢復後 quota evidence 仍需完整驗證才可呼叫假 CLI。

## [x] 【整合流程】打包背景程序與 Core 使用相同 Node
**範例輸入**：Core 資源目錄同時存在 bundled Node，系統亦有 Homebrew Node。
**期待輸出**：產生的 launcher 先選 bundled Node，Homebrew 只作 fallback。

## [x] 【狀態回歸】安全恢復尚未 dispatch 的時區錯誤
**範例輸入**：已註冊 target 曾因 authority mismatch 進入人工檢查，之後 runtime 精確回復註冊 authority。
**期待輸出**：恢復監看；只有合法到期 quota evidence 才呼叫假 CLI，其他錯誤不會自動清除。

## Security Review Result

- Protected asset：精確註冊的 Codex 任務與「最多送一次」的續跑權限。
- Boundary：LaunchAgent Node 選擇、SQLite target state、quota evidence 到 fake dispatcher。
- Controls：bundled Node 優先、完整 authority 相等、只接受特定 pre-dispatch error、所有 claim/evidence/attempt 欄位為空、其他錯誤維持 fail closed。
- Validation：完整測試、DMG packaged runtime smoke、獨立黑箱 QA；真實 Codex 呼叫為 0。
- Verdict：PASS。顯式 `DEVDIARY_NODE_BIN` 若選到不同 runtime 仍會安全停止，這是保留的管理者 override。
