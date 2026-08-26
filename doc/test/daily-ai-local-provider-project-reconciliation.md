# Daily AI、本機 Ollama 與專案軟清理 Level 4 測試

## Test Depth Route

- Level: 4
- Reason: 外部 provider、使用者控制的 endpoint、SQLite migration、長任務租約、背景狀態、正式 App 安裝，以及同一功能已經歷多輪契約修正。
- Required verification: 先失敗的 Core/UI tests、完整 Core/UI suites、typecheck、build、security probes、legacy DB fixture、localhost API/UI、真實 `qwen3:8b` adapter、packaged App、獨立黑箱 QA、diff review。
- Allowed skips: 不做 public release、push、Developer ID/notarization、public/cloud endpoint 或硬刪除測試。

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
- Safe environment or localhost command: temporary/in-memory SQLite、loopback Core、`OLLAMA_HOST=127.0.0.1:11434`、desktop-only 1280x820。
- Safe test account / mock access: 不需帳號；真實 Ollama 只使用本機 `qwen3:8b`。
- Forbidden or destructive actions: 不硬刪 runtime project/history、不碰 public endpoint、不 push/publish；正式 App 替換前必須停止 owned writers 並建立 SQLite Backup API snapshot。

## Security Review Route

- Threat model: 私人 prompt/project evidence、filesystem path、app-owned SQLite history、scheduler ownership、installed App availability。
- Input/sink: Settings JSON 與 endpoint/options → local/private fetch；filesystem observation → SQLite presence state；package/install → `/Applications/DevDiary.app`。
- Required controls: exact Origin middleware、local/private origin allowlist、redirect error、typed bounds、parameterized SQL、complete-root/two-period gate、abort/fence、consistent backup/rollback。

## [x] 【function 邏輯】Ollama safe defaults 與所有進階參數會正規化並獨立持久化
**範例輸入**：legacy Ollama custom agent 與完整 versioned provider settings。
**期待輸出**：legacy `core.custom_agents` shape 不變；API snapshot 合併 defaults/設定；固定於 0.1.3 revision `3dccf669dc4b952818a89378cf1e4754d708248d` 的真實 Settings/DB reader 可開啟升級後 SQLite、載入 custom agent、執行舊版寫入，而且不會清除 `custom_agent_providers_v1`。

## [x] 【資料邊界】Ollama 數值、keep-alive 與 stop 邊界逐一拒絕越界
**範例輸入**：min/max、剛好越界、numeric string、NaN/Infinity、9 個 stop、控制字元、未知 key。
**期待輸出**：合法值持久化；任何非法欄位使整次 mutation 零寫入失敗。

## [x] 【安全繞過】Endpoint 只能是 origin-only local/private 且不追 redirect
**範例輸入**：loopback、RFC1918、IPv6 loopback/ULA、`.local`、public host、credentials、path/query/fragment、302。
**期待輸出**：只接受允許 origin；fetch 固定 `redirect: error`；302 不送第二跳且產生 sanitized outcome。

## [x] 【整合流程】實際 Ollama request 只包含 allowlist 並可關閉 thinking
**範例輸入**：`qwen3:8b`、`thinking=false`、bounded context/output/sampling。
**期待輸出**：top-level `think`/`keep_alive` 與 options shape 精確；無 arbitrary JSON/template/prompt override；真實 adapter 在 timeout 內完成。

## [x] 【狀態回歸】目標日期固定、租約時間前進且完成時間真實
**範例輸入**：固定 Taipei target instant、可推進 `leaseNow`、超過初始 lease 的 provider 工作。
**期待輸出**：date 不變；lease renewal/completion 前進；elapsed 大於零；不會被第二 owner 誤搶。

## [x] 【操作順序】Lease loss 會中止 fetch/CLI 且禁止所有後續寫入
**範例輸入**：provider await 中 renewal failure，以及 provider return 後/write 前 lease loss。
**期待輸出**：signal abort；projectWrites、global summary、Kanban 每層 post-await/in-transaction fence 均阻止寫入與 success count；雙 SQLite 連線證明 Kanban upsert 在 generation 檢查到實際寫入之間持有 writer lock，失去 owner 的寫入為零。

## [x] 【整合流程】Telemetry 每個 family 滿足 typed invariant
**範例輸入**：provider success、deterministic fallback、timeout/malformed failure、confirmed diary、no activity、zero-card Kanban。
**期待輸出**：project/daily/highlight/Kanban invocation 的 attempted 等式成立；deterministic card writes 與 provider invocation 分開。

## [x] 【Mock API】API version 6 capability handshake fail closed
**範例輸入**：version 5、version 6 缺 capability、version 6 完整 capabilities。
**期待輸出**：前兩者 stale 且不能送新設定；完整者 connected 並可操作。

## [x] 【資料邊界】Schema migration additive、idempotent 且不刪歷史
**範例輸入**：v6 fixture DB 含 sessions/diaries/summaries/Kanban/comments/docs。
**期待輸出**：新增 presence/lease/reconciliation state；重開無錯；所有 child counts 不變。

## [x] 【競爭條件】跨午夜的兩個 reconciliation owner 在 final transaction 再查七日 cadence
**範例輸入**：兩個 SQLite 連線分別以相鄰日期 claim，較晚日期先完成。
**期待輸出**：final transaction 只允許一個 success 更新 missing counter；較早 owner 轉為 superseded failure 並回 skipped，七日內不會重複計數。

## [x] 【狀態回歸】兩個不同週期 miss 才軟隱藏且同週並行只算一次
**範例輸入**：完整可讀 root 下路徑 ENOENT；兩 caller 同時 claim 同 period。
**期待輸出**：第一次仍 present；同週第二 caller skipped；下一週第二 miss 才 missing。

## [x] 【錯誤處理】Root unavailable/partial/permission error 不增加 miss
**範例輸入**：configured root 消失、readdir partial、tracked stat 非 ENOENT error、marker/depth 改變但路徑仍存在。
**期待輸出**：全部不隱藏；direct stat 存在會保持/恢復 present。

## [x] 【整合流程】Missing 專案退出正常 list/scan/scheduler 且 rediscovery 原地恢復
**範例輸入**：含歷史 child rows 的 missing project，之後資料夾重新出現。
**期待輸出**：正常工作流看不到/不呼叫 provider；歷史未變；rediscovery 同 id 恢復並清 counter。

## [x] 【前端元素】Settings 顯示所有 Ollama 控制並完成軟清理能力握手
**範例輸入**：version 6 settings snapshot、loopback/LAN endpoint、validation error。
**期待輸出**：基本欄位與折疊 Advanced 可編輯；LAN 警告清楚；錯誤不遺失使用者輸入；desktop 1280x820 無溢位。

## [ ] 【整合流程】Package identity、SQLite backup、安裝與 rollback 可驗證
**範例輸入**：clean committed 0.1.4 candidate、App/DMG、停止 writers、SQLite Backup API snapshot。
**期待輸出**：identity receipt 綁 revision/clean state/package inputs/version/App/DMG/DB digest；安裝後 Core v6、Ollama、23:40 通過；失敗可依序恢復 App/DB。
