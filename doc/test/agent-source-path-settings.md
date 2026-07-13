# Canonical Agent Executable And Activity Log Source Settings Test Plan

## Test Depth Route

- Level: 3
- Reason: 跨 Settings persistence、SQLite transaction、filesystem traversal、CLI execution、Local HTTP API、scan/runtime consumer 與 React/Tauri UI 的整合功能。
- Required verification: Core unit/integration tests、Core typecheck、root UI API tests/build、security review、API/runtime smoke、desktop/mobile RWD、Black-box QA、Tauri smoke、diff review。
- Allowed skips: 不對使用者真實 CLI logs 寫入、搬移或刪除；不在本 slice 新增 Claude/Codex diary execution adapter；不以 production 帳號或 token 做測試。

## Bug Pattern Coverage

- [x] Input normalization / aliases / format variants：legacy missing `sources`、leading `~`、絕對/相對路徑、canonical realpath dedupe。
- [x] Boundary values / empty / null / malformed input：空 custom roots、未知 mode/key、control character、過長 path、file/directory 類型錯誤。
- [x] Rule priority conflicts：custom executable 不 fallback；auto executable env → app bundle → known path → PATH；auto/custom activity roots。
- [x] Negation / exclusion / opt-out / unlimited：reset auto、custom-only 不加入 defaults、agent source PATCH bypass 拒絕。
- [x] Contract generated and execution applied：resolved settings 實際傳入 detection、preflight、Antigravity execution、global/project/background scan。
- [x] Operation order invariants：custom executable probe + identity recheck 成功後才 transactionally persist；revision conflict 不覆寫。
- [x] Production-like dirty data：missing root、unreadable root、invalid product layout、legacy payload、existing custom agents、duplicate logs。
- [x] Multi-condition combinations：scheduler/custom-agent/source writes 交錯時保留所有 narrow fields；多 root 部分失敗仍可 scan。
- [x] Security bypass mixed with normal input：directory/non-executable/symlink executable、symlink escape/cycle、shell-looking path、token-like child env。
- [x] State/history/retry/refresh behavior：monotonic revision、GET/POST detection fresh/no mutation、stale UI revision 409、custom executable 日後失效。
- [x] Externally observable result, not only implementation detail：API envelope、UI 顯示 executable 與 logs 分離、RWD、safe scanner warning/no fake data。

## Runtime Verification Route

- Runtime smoke: REQUIRED
- Black-box QA: REQUIRED
- Safe environment or localhost command: temporary SQLite/Core on loopback + Vite/Tauri local runtime。
- Safe test account / mock access: fake executable fixture、temporary product-root fixture 與 test DB；不使用或輸出真實帳密。
- Forbidden or destructive actions: 不使用 `shell:true`、不執行使用者輸入 argv、不寫入 log roots、不讀/顯示 raw transcripts、不得印出 secrets。

## [x] 【function 邏輯】legacy Settings migration 與 source mode invariants
**範例輸入**：缺少 `sources`/`revision` 的 legacy payload；auto/custom/auto_plus_custom settings；unknown key、relative/control/leaf path。
**期待輸出**：snapshot 有 `revision:0` 與 default sources；合法 input 正規化為 absolute unique data roots；非法 input field-specific 400 且無部分寫入。

## [x] 【整合流程】所有 settings writers 以 fresh immediate mutation 保留交錯欄位
**範例輸入**：settings patch、custom agent enable/remove、scheduler state、兩個 targeted source writes 以 interleaved read/write 觸發。
**期待輸出**：每次成功 write 遞增 revision；來源設定、scheduler 與 custom agent 變更彼此不覆蓋；stale expected revision 回 409。

## [x] 【function 邏輯】canonical executable resolver 與 probe-before-save
**範例輸入**：custom regular executable、directory/non-executable/broken symlink、probe 期間 identity change；auto env/app/known/PATH candidates。
**期待輸出**：只用 fixed argv `execFile`/`shell:false`；custom 失敗不 fallback；identity/探測失敗不儲存；auto 按既定 precedence 解析。

## [x] 【Mock API】detection 與 targeted source APIs 回傳固定 envelope
**範例輸入**：GET/POST detect、PUT executable/activity source、stale revision 與 invalid custom path。
**期待輸出**：top-level compatibility fields 對應 nested status；source status 分離顯示 logs；成功回 `{ agent, source_status, revision, updated_at }`；400/409 安全且不洩漏 stdout/stderr/env。

## [x] 【整合流程】persisted executable resolver 被 preflight 與 Antigravity execution readers 採用
**範例輸入**：自訂 agy fixture path，呼叫 health/preflight、project/daily diary、Kanban/daily/background gate。
**期待輸出**：每個 canonical execution reader 使用同一 resolved custom path；不存在 custom path 顯示 failed 且不暗中 fallback。

## [x] 【function 邏輯】activity root resolver 與 parser safe traversal
**範例輸入**：Claude current/legacy encoding、多 Codex roots、Antigravity root；missing/unreadable root、root dedupe、external symlink escape、symlink cycle。
**期待輸出**：Core 從 product data root 推導 leaf locations；可讀 roots 繼續掃描且 dedupe；壞 root/symlink 僅產生 sanitized warning，無假資料或重複 session。

## [x] 【整合流程】三個 production scan entry points 使用 persisted activity roots
**範例輸入**：global scan、selected-project rescan、background cycle，各使用 custom-only roots。
**期待輸出**：全部 provider consumer 掃同一設定來源；daily scheduler 不直接 scan；missing executable 不阻礙既有可讀 logs。

## [x] 【前端元素】CLI Agents 分開管理 executable 與 activity log sources
**範例輸入**：切換 modes、手動輸入、file/folder picker draft、add/remove roots、probe/save、reset auto、409 conflict。
**期待輸出**：每張 canonical card 顯示兩個獨立區塊與白話狀態；picker 不自動 probe；設定值與 resolved value 不混淆；Claude mapping 是 Core 唯讀資料。

## [x] 【RWD】CLI Agents desktop/mobile layout 可用
**範例輸入**：1440x900 與 390x844，長路徑、warnings、多 root。
**期待輸出**：無水平溢出、重疊或不可點控制；狀態與行列在 mobile 可讀。

## [x] 【安全繞過】使用者字串不能改成 shell execution 或洩漏敏感資料
**範例輸入**：含 shell metacharacters/token-like strings 的 path、symlink 到 root 外、malformed CLI output。
**期待輸出**：Core 驗證或安全拒絕；error/log/API response 不含 token、raw env、stdout/stderr 或 log content。
