# Delta Spec: Canonical Agent Executable And Activity Log Source Settings

> Date: 2026-07-12
> Status: implemented / verified
> Review level: 3
> Review state: `docs/specs/reviews/agent-source-path-settings-review-state.md`

## 背景與問題

CLI Agents 頁目前只顯示 canonical agent 的偵測結果（例如 `binary_path`），但沒有清楚區分兩種完全不同的來源：

1. **CLI 執行檔**：Core 可執行 `--version` / `--help` 的本機程式。找到它代表可安全探測該 CLI；它不是 Terminal.app 的路徑。
2. **活動記錄資料夾**：Core read-only 掃描對話與 token/session 紀錄的位置。即使沒有找到 CLI 執行檔，只要 log 仍存在，DevDiary 仍可能讀到歷史資料。

目前兩種來源都依賴內建預設或 process environment，使用者無法從 UI 看出實際讀取位置，也無法在自動偵測失敗、資料搬移或同時存在多個資料根目錄時自行修正。

Claude 的 `~/.claude/projects/<encoded-project>/` 另有理解門檻：`<encoded-project>` 是 Core 依 project root 算出的子資料夾名稱，不是可手動設定的變數或路徑欄位。

## 目標

- 在每個 canonical agent card 以白話分成「CLI 執行檔」與「活動記錄資料夾」。
- 兩者預設自動偵測，也能由使用者手動輸入或用 macOS picker 選擇。
- 顯示「設定值」與「本次實際使用值」的差異、來源、可用狀態與錯誤原因。
- 手動設定必須真的成為 Core detection、scan 與 canonical agent execution 的輸入，不能只改畫面。
- 保持既有使用者與既有 settings payload 向後相容。

## Non-goals

- 不把 Terminal.app、iTerm.app 或其他 terminal emulator 當成 CLI executable。
- 不讓使用者編輯 Claude `<encoded-project>`；v1 不提供 per-project log folder override。
- 不搬移、刪除或修改 CLI log；所有活動記錄來源維持 read-only。
- 不合併不同供應商的帳號、認證或 log format。
- 不在首次 onboarding 增加 path 設定步驟；使用者完成 onboarding 後在 CLI Agents 頁管理。
- 不保證不同產品一定共用 log。Core 只呈現並掃描已解析、可讀的實際來源。

## 名詞與資料邊界

- **Configured value**：使用者持久化的 mode、executable path 或 log roots。
- **Resolved value**：Core 本次根據 configured value、自動候選與 filesystem 狀態得到的實際來源；不持久化。
- **Executable source**：可由 Core 以固定 argv、`execFile`、`shell:false` 探測或執行的檔案。
- **Activity log root**：Core 可 read-only 列舉與解析的資料夾。
- **Claude encoded project directory**：`activity log root + Core(project.root_path -> encoded name)` 得到的衍生目錄；只顯示，不可編輯。

## 新增（Added）

### 1. Persisted settings contract

在每個 `SettingsAgent` 新增 `sources`，只儲存使用者意圖，不儲存探測結果：

```ts
type ExecutableSourceMode = 'auto' | 'custom';
type ActivityLogSourceMode = 'auto' | 'auto_plus_custom' | 'custom';

interface CanonicalAgentSourceSettings {
  executable: {
    mode: ExecutableSourceMode;
    configured_path: string | null;
  };
  activity_logs: {
    mode: ActivityLogSourceMode;
    configured_data_roots: string[];
  };
}
```

- Missing `sources` migrates in memory to executable `auto` + activity logs `auto`.
- Settings snapshot/persisted JSON 新增 monotonic integer `revision`；legacy payload 預設 `0`，每次成功 write 在同一 SQLite transaction 內遞增。`updated_at` 只供顯示，不作 concurrency token。
- `auto` executable mode requires `configured_path: null`; `custom` requires one valid path.
- `auto` activity log mode requires an empty custom list.
- `auto_plus_custom` merges defaults and custom roots.
- `custom` uses only configured data roots and requires at least one non-empty root.
- Settings normalization rejects unknown keys, duplicates after canonicalization, control characters, relative paths and overlong values with field-specific 400 errors.
- `~` may be accepted at the API boundary only when it is the leading home shorthand and must be expanded by Core before validation/status output. UI stores/displays the normalized absolute path returned by Core.

### 2. Runtime source status contract

`GET/POST /api/agents/detect` returns per-agent source status in addition to the existing compatibility fields:

```ts
interface AgentSourceStatus {
  executable: {
    mode: ExecutableSourceMode;
    configured_path: string | null;
    resolved_path: string | null;
    source: 'custom' | 'environment' | 'app_bundle' | 'known_path' | 'path' | 'not_found';
    exists: boolean;
    is_executable: boolean;
    probe_status: 'connected' | 'failed' | 'not_found';
    checked_at: string;
    error_message: string | null;
  };
  activity_logs: {
    mode: ActivityLogSourceMode;
    configured_data_roots: string[];
    resolved_data_roots: Array<{
      path: string;
      source: 'default' | 'custom';
      exists: boolean;
      readable: boolean;
      real_path: string | null;
      warning: string | null;
    }>;
    derived_scan_locations: Array<{
      data_root: string;
      role: 'claude_projects' | 'codex_sessions' | 'codex_archived_sessions' | 'antigravity_log' | 'antigravity_brain';
      path: string;
      project_id: number | null;
      project_root: string | null;
      encoding_variant: 'current' | 'legacy' | null;
      exists: boolean;
      readable: boolean;
      warning: string | null;
    }>;
  };
}

interface AgentDetectionResult {
  // 既有 compatibility fields：id/display_name/available/status/binary_path/version/checked_at/error_message
  source_status: AgentSourceStatus;
}

interface CanonicalAgentSourceUpdateResponse {
  agent: SettingsAgent;
  source_status: AgentSourceStatus;
  revision: number;
  updated_at: string;
}
```

- Existing top-level `binary_path`, `available`, `status`, `version`, `checked_at` and `error_message` remain during this slice and mirror executable probe status for compatibility.
- Compatibility mapping 固定為：nested `connected` → top-level `status:'connected'` + `available:true`；nested `failed` 或 `not_found` → `status:'offline'` + `available:false`。`failed` 保留 `binary_path:resolved_path` 供診斷，`not_found` 使用 `binary_path:null`。
- Detection must load current persisted settings before resolving sources. 為相容既有 frontend，GET 與 POST 都執行 fresh probe、回傳相同 contract 且不 mutates settings；本 slice 不引入 detection cache。
- 新增 `PUT /api/agents/:id/executable-source` 作為 Core-enforced「測試並儲存」原子操作：
  - request：`{ mode:'custom', configured_path:string, expected_revision:number }` 或 `{ mode:'auto', configured_path:null, expected_revision:number }`。
  - custom mode 在同一 request 內 normalize、realpath/stat、以固定 argv probe、再次 stat identity，全部成功才 transactionally persist。
  - auto mode 不執行 custom path，直接 transactionally reset。
  - settings revision 不符回 409 `settings_conflict`；probe/identity 失敗回 400 且完全不寫入。
  - response 固定使用 `CanonicalAgentSourceUpdateResponse`。
- 新增 `PUT /api/agents/:id/activity-log-source`，以 `{ mode, configured_data_roots, expected_revision }` targeted/transactional 更新該 agent logs 設定；revision mismatch 同樣回 409。
- 兩個 PUT 都回同一 `CanonicalAgentSourceUpdateResponse` envelope；GET/POST detection 則在每個既有 agent item 的 `source_status` key 放入 status，frontend 不得自行猜 property name 或展平欄位。
- Public `PATCH /api/settings` 仍可更新 agent 的 `enabled/model/reasoning`，但 canonical `sources` 視為 read-only：若值與 current 不同則回 400 並指示使用 targeted source endpoints，避免 custom executable 繞過 probe。Persistence loader/serializer 仍完整處理 `sources`。
- 新 routes 必須加入 runtime health capability contract 與 stale-Core 白話錯誤 mapping。

### 2.1 Atomic settings mutation primitive

- 新增單一 `mutateSettings` primitive，所有 app-owned settings writers 都必須改走此入口：`updateSettings`、`addCustomAgent`、`updateCustomAgentEnabled`、`removeCustomAgent`、`updateDailySchedulerState`，以及本 slice 的兩個 targeted source endpoints。
- Primitive 必須在同一 `db.transaction(...).immediate()`（或等價 `BEGIN IMMEDIATE`）內 fresh-read `app_settings/core`、檢查 optional `expected_revision`、對最新 snapshot 套用 narrow mutator、遞增 revision、寫回並回傳新 snapshot；不得在 transaction 外先 read 再帶 stale whole-object write 入內。
- UI/user-initiated source write 必須帶 `expected_revision`；background/scheduler internal state write 可不帶 expected revision，但仍須在 immediate transaction 內 fresh-read 並只 merge 自己的 narrow field，保留 agents `sources` 與其他並發更新。
- `settings_conflict` 不重試 executable probe 或自動覆蓋；UI reload 後由使用者再次確認。Internal state writer 遇 SQLite busy 依現有 bounded busy policy 處理，不可用 stale snapshot retry。

### 3. Canonical source resolvers

新增單一 canonical resolver 層，供下游共同使用：

- `resolveCanonicalExecutable(agentId, sourceSettings, env)`
- `resolveCanonicalActivityLogRoots(agentId, sourceSettings, homeDir)`

Executable precedence：

- `custom`：只嘗試 configured path；失敗時保留設定與明確錯誤，不暗中 fallback。
- `auto`：environment override → app bundle candidate → known absolute path → process `PATH`。

Activity log mode（設定值一律是 **product data root**，不是 parser leaf folder）：

- `auto`：只使用 app 內建 defaults。
- `auto_plus_custom`：defaults + configured data roots，依 resolved real path 去重。
- `custom`：只使用 configured data roots，不暗中加入 defaults。

內建 default data roots 與 Core 固定衍生的 read-only scan locations：

| Agent | Data root | Derived scan locations |
|---|---|---|
| Claude Code | `~/.claude` | `projects/<encoded-project>`（每個 project current + legacy variants） |
| Codex CLI | `~/.codex` | `sessions`、`archived_sessions` |
| Antigravity CLI | `~/.gemini/antigravity-cli` | `log`、`brain` |

自訂 data root 必須維持相同 product directory layout；Core 不以 basename 猜 root role。畫面同時顯示使用者設定的 data root 與 Core 實際衍生的 scan locations，讓使用者知道真正讀到哪裡。

### 4. UI source controls

在既有 CLI Agents 頁的每張 canonical agent card 增加兩個可展開區塊，不在 general Settings 重複一份：

#### CLI 執行檔

- 白話說明：「這是 DevDiary 用來確認 CLI 已安裝、並在需要時呼叫 CLI 的執行檔，不是 Terminal app。」
- 顯示模式（自動 / 自訂）、configured path、resolved path、偵測來源、版本、最後檢查時間與錯誤。
- `自訂` 提供可手 key 的單一路徑欄位，以及 Tauri file picker（`directory:false`, `multiple:false`）；picker 只填入 draft，不觸發 probe。
- 變更自訂 path 後顯示「測試並儲存」；未 probe 成功前不得啟用新值。
- 提供「恢復自動偵測」。
- Web dev runtime 無法取得 macOS absolute path 時，保留手動輸入並顯示白話提示。

#### 活動記錄資料夾

- 白話說明：「這些資料夾保存 CLI / Desktop app 產生的歷史活動；即使 CLI 執行檔未找到，只要資料夾可讀，DevDiary 仍可掃描既有資料。」
- 模式為「只用自動偵測」、「自動偵測 + 額外資料夾（建議）」、「只用自訂資料夾」。
- 路徑列沿用 Settings `Project Roots` 的 interaction pattern：一列一個 product data root、可手 key、folder picker、add/remove。
- 每個 resolved root 顯示 default/custom、存在/可讀、warning；不可讀的 root 不阻斷其他 root。
- 提供「恢復自動偵測」。

#### Claude encoded project 呈現

- Claude card 顯示說明：「DevDiary 會依每個 Project Root 自動換算 Claude 的子資料夾名稱。」
- 可展開唯讀 mapping：`project.root_path → resolved encoded directory/directories`，直接使用 Core `derived_scan_locations` 的 `project_id/project_root/encoding_variant`，同時支援 parser 目前的新舊 encoding 變體；React 不重新實作 encoding。
- 若所選目錄 real path 正好等於 Core 從任一 candidate data root + 目前 Project Roots 推導出的 `projects/<current-or-legacy-encoding>`，UI/Core 回傳 field-specific 提示，要求選擇 product data root（例如 `~/.claude`）。未知 project 的 encoded-looking name 不猜測、不阻擋。
- 若選到已知 leaf（Claude `projects`/encoded child、Codex `sessions`/`archived_sessions`、Antigravity `log`/`brain`），回傳對應「請選上一層 data root」提示，避免衍生 `sessions/sessions` 等錯誤。

## 修改（Changed）

### Detection / execution consumers

- `agentDetection.ts` 不再自行擁有完整 candidate precedence；改用 canonical executable resolver。
- `schedulerPreflight.ts` 與 `/api/agents/detect` 使用同一份 persisted source settings；server 建立 preflight 時不可再把無 settings 的 default detector 傳入。
- canonical agent 的實際執行 adapter 必須使用同一 resolver。此 slice 已知的 production execution readers 是 Antigravity health probe、project diary、daily summary、Kanban AI（重用 daily generator），以及它們在 daily scheduler/background gate 內的呼叫；不得只修 detection 而讓 `agy --print` 或 health probe 繼續走另一組 hardcoded lookup。
- Claude/Codex 在目前 production diary flow 沒有 execution adapter；本 spec 不虛構新的執行用途，但未來 adapter 必須依賴同一 resolver。

### Log parser / scan consumers

- `CliLogParserOptions` 接受按 canonical agent 分組的 resolved data roots/derived scan locations，不再只由單一 `homeDir` 拼出所有來源。
- Claude parser 對每個 resolved Claude data root 加上 `projects` 與內部 encoding mapping 找 project directories。
- Codex shared index 從每個 resolved Codex data root 衍生 `sessions` 與 `archived_sessions`。
- Antigravity parser 從每個 resolved data root 分別衍生 `log` 與 `brain`，不再假設唯一 home default。
- 三個 production Core provider call sites 都必須從 persisted settings 建立同一 configured scan provider：global `/api/scan`（manual、onboarding、startup auto-scan 共用）、selected-project rescan、background cycle。Daily scheduler 本身不直接 scan；scheduler preflight 只驗證同一 source configuration/detection contract。
- 不存在或不可讀的 root 產生 sanitized warning 並跳過；其他可讀 root 繼續掃描。去重後同一 log 不得重複建立 session。

### Settings / UI API mapping

- `normalizeAgents`、defaults、persistence loader/serialization 與 frontend mapping 支援 nested `sources`，並保留既有 `enabled/model/reasoning`；source writes 只走 targeted endpoints。
- CLI Agents view model 不再把 `binary_path` 與「資料來源」混成同一個 path。
- 首次 onboarding 維持既有 detection/scan 流程，會自動使用新的 defaults，但不新增設定頁。

## 移除（Removed）

- 移除「找不到 executable 就等於完全沒有 agent 資料」的 UI 暗示。
- 移除 parser 在 runtime hot path 中直接 hardcode `~/.claude`、`~/.codex`、`~/.gemini` 作為唯一來源的行為。
- 移除 Antigravity detection 與 diary execution 各自解析不同 binary path 的分歧。

## Security / privacy boundary

Executable path 是 code-execution boundary：

- 只接受 absolute regular file；拒絕 directory、NUL/newline/carriage return、超長路徑與不可執行檔。
- Core 解析 symlink/real path 並在 UI 顯示實際目標；broken symlink 失敗。Atomic endpoint 在 probe 前後比較 real path + device/inode/size/mtime identity，probe 期間變動即拒絕；持久化成功後，每次 probe/正式執行前仍重新驗證目前檔案為 regular/executable 並 fresh probe。
- Probe 與正式執行只用 `execFile` + argv、`shell:false`、固定允許的 probe args、timeout、maxBuffer、非 project cwd。
- Child env 由共用 builder 明確 allowlist：`HOME`、resolved minimal `PATH`、`TMPDIR`、locale、CA certificate 與 proxy variables（含大小寫 variants）；provider 明確需要的額外 config 必須逐項加入並測試。禁止把 `CLAUDE_CODE_OAUTH_TOKEN`、任意 `*_TOKEN`/`*_API_KEY` 或 DevDiary secrets 繼承給 probe；任何 env value 都不得進 log/error。CLI 自己在 user home 的 credential store 不由本功能讀取或展示。
- 不因 input blur 或 picker 完成自動執行；必須由使用者按「測試並儲存」。probe 成功後才持久化並啟用新 custom path。
- API error 不回傳完整 stdout/stderr、環境變數、token 或 project file content。

Activity log roots 是 local data read boundary：

- 只接受 absolute directory，展開 home shorthand 後 canonicalize/dedupe；拒絕控制字元與檔案 path。
- Core 只 read/list/parse，不建立、修改、搬移或刪除來源內容。Recursive walker 使用 `lstat` + `realpath`、每個 data root 的 `rootRealPath` containment、`visitedDirectoryRealPaths`；越界 symlink 跳過並回 sanitized warning，symlink cycle 最多訪問一次。
- Symlink 必須以 resolved real path 做 containment 與 dedupe；warning 不洩漏 log content。
- `ParserWarningKind` 擴充為既有 `malformed_jsonl | unreadable_file` 加上 `missing_root | unreadable_root | invalid_data_root_layout | symlink_escape | symlink_cycle`；所有 warning 延用 `{ agent_name, kind, source, line?, message }` shape，`source/message` 只含 normalized path/原因，不含 log content。
- Local HTTP settings/detection endpoints維持 loopback-only；React 不直接碰 filesystem 或執行檔。

## Failure semantics

- Saved custom executable 日後消失或不可執行：保留 configured value、標示 failed；custom mode 不 fallback。使用者可修正或恢復 auto。
- Auto executable 全部候選失敗：`resolved_path:null`、`not_found`，但 activity log 狀態仍獨立顯示與掃描。
- 單一 log root 不存在/不可讀：顯示 warning 並跳過；若仍有其他 root，scan 繼續。
- 所有 log roots 都不可用：scan 成功完成但回傳 no-data + warnings，不寫 fake sessions，不 fallback 到未設定的 defaults。
- Targeted source validation/probe 失敗：400 且不部分寫入 settings。
- `expected_revision` 與 current revision 不同：409；UI 保留 draft、重新載入並要求使用者重試，不假裝已儲存。
- Probe 期間 executable identity 改變：400 `executable_changed_during_probe` 且不寫入。Core 不持久化 approved inode identity；儲存後同一路徑的 CLI 正常升級可在下次 fresh validation/probe 成功後繼續使用，只有當時已非 regular/executable 或 probe 失敗才標示 failed。本功能不承諾偵測「內容已替換但仍合法且 probe 成功」的 executable provenance。

## Implementation sequence

1. 擴充 settings types/defaults/normalization/migration 與 contract tests。
2. 建立 pure source resolvers，補 precedence、path validation、symlink/dedupe tests。
3. 實作 targeted source APIs 與 revision/transaction rules，再讓 detection、scheduler preflight、Antigravity health/diary/Kanban execution 使用 executable resolver。
4. 讓 parser/provider 與所有 scan entry points 使用 resolved activity roots。
5. 擴充 detection API status 與 frontend API mapping。
6. 實作 CLI Agents source controls、Tauri file/folder picker 與白話狀態。
7. 補 migration、API、parser、execution、UI tests，再做 desktop/mobile browser 與 packaged Tauri smoke。

## Test depth / verification

`test-depth-router` 預期：高風險 integration；Black-box QA required。實作前仍須由該 skill fresh routing。

- Settings tests：missing `sources`/revision migration、mode invariants、unknown keys、invalid/control/relative paths、targeted atomic write、PATCH bypass rejection、409 conflict；五個既有 writer 與兩個新 writer 都經 common immediate mutation primitive，並以 interleaved scheduler/custom-agent/source writes 證明不遺失欄位。
- Resolver tests：custom/auto precedence、env/app/PATH、missing/non-file/non-executable、symlink、realpath dedupe。
- Detection/API tests：compatibility `connected/failed/not_found` mapping、separate log status/Claude mapping fields、GET/POST fresh/no mutation、atomic custom probe-and-save、identity change、custom failure no fallback。
- Parser tests：Claude custom data root + encoding variants、multiple Codex data roots、Antigravity derived log/brain、unreadable root isolation、duplicate session suppression、external symlink escape、symlink cycle。
- Consumer tests：global endpoint（manual/onboarding/startup）、project rescan、background cycle receive persisted roots；scheduler itself does not scan；Antigravity health probe/project diary/daily summary/Kanban AI及 daily/background gate receive configured binary。
- UI tests：manual input、file/folder picker mapping、mode switching、probe-before-save、reset auto、plain-language error/status、encoded directory read-only mapping。
- Regression：legacy settings payload、existing custom agents、onboarding、scheduler preflight、Project Roots controls。
- Verification：Core full tests/typecheck、root tests/build/lint if present、`git diff --check`、security review、desktop/mobile RWD、Tauri picker/runtime smoke。

## 驗收條件

- [ ] 每張 canonical agent card 明確分開顯示 executable 與 activity log roots。
- [ ] 未設定的新舊使用者都維持現有自動偵測與掃描結果。
- [ ] 使用者可手 key 或 picker 設定 executable；只有 probe 成功才啟用並儲存。
- [ ] 使用者可手 key 或 folder picker 設定多個 product data roots，且三種 mode 行為符合 contract。
- [ ] `binary_path` 未找到時，既有可讀 logs 仍可被掃描，UI 不再顯示成同一種失敗。
- [ ] Claude `<encoded-project>` 由 Core 自動推導並以唯讀 mapping 顯示，不成為輸入欄位。
- [ ] Detection、scheduler preflight、Antigravity diary execution 共用 executable resolver。
- [ ] 所有 production scan entry points 共用 persisted activity roots；無 display-only wiring。
- [ ] 不可讀 root 只影響自身；custom-only 不 silent fallback；重複 real path 不重複解析。
- [ ] Executable 與 log root security boundary、legacy migration、API/UI/parser/consumer tests及 black-box QA 通過。

## 文件同步

- 實作完成後更新 `docs/specs/MASTER.md` 的 Settings、CLI parser、CLI Agents UI、已知缺口與 delta status。
- 尚未實作前，MASTER 只可將本 delta 列為 planned/reviewed，不得描述為 current behavior。
- PR 合併後將本檔 Status 改為 `merged`。
