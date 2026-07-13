# Delta Spec: Scan State, Diary Agents, And Project Docs Usability

> Branch: `codex/agent-source-path-settings-public`
> Date: 2026-07-13
> Status: implemented / verified
> Review: Level 3 — shared scan persistence/scheduling, local CLI execution, local file-derived documents, and React UI state.

## 背景與目標

這個 slice 修正使用者可見但目前互相脫節的 runtime 狀態，並完成已安裝 Codex CLI 的日記摘要能力：

1. 左下角與 Settings 的「最近掃描」要以任何成功或失敗的 global / project / background scan 為單一真相來源；背景 runner 的下一次 scan 必須以最新完成時間重算，不能忽略手動 scan。
2. UI 要在 background scan 開始時立即顯示進行中與 spinner；完成後顯示 fresh timestamp，且不覆寫未送出的 Settings、comment 或 diary editor。
3. Claude 與已安裝的 Codex CLI 都能安全產生 project / daily diary Markdown；Codex 使用固定 argv 的 non-interactive `codex exec`、temporary cwd、allowlisted child env、timeout、沒有 shell，失敗仍回 deterministic fallback。
4. CLI Agents 卡片只在「CLI 執行檔」區塊顯示 version / binary path；path 不得 ellipsis 截斷。活動記錄資料夾使用真正的 SVG folder icon。
5. Project Docs 以更新時間新到舊排序，再依路徑階層自動分組（例如 root filename、`docs/specs/`、`docs/specs/deltas/`），不得寫死特定路徑；提供 filename 與內容皆可搜尋的 case-insensitive local filter，並保留預覽。

## 修改（Changed）

- 將 manual global scan、manual project rescan 與 background cycle 收斂到唯一的 Core-owned `recordScanOperation`；路由與 runner 不得各自直接呼叫 `updateBackgroundScanState`。每次開始先產生 UUID `operation_id`，並帶 `scope: global | project | background`、project scan 的 `project_id`、`started_at`。`background_scan` 保存 `running_operations`（可同時存在多筆）、`last_completed_operation`（含同一組 identity）、terminal `last_status: idle | success | failed | skipped`、counts、error redaction 與 `next_due_at`；client PATCH 不可直接寫。
- Recorder 的 start 只新增自己的 `operation_id`；finish 只移除自己的 `operation_id`，並以同一 SQLite settings mutation 的 read/compare/write 完成。只有 `completed_at` 晚於目前 `last_completed_operation.completed_at` 的 terminal completion 可以更新 last-completed fields；相同 timestamp 以 UUID lexical order 作 deterministic tie-break。較舊 completion 仍移除自己的 running record，但不得倒退 timestamp、status、counts 或 due time。這是 completion monotonicity；任何仍在跑的 operation 令 UI runtime state 為 `running`，terminal detail 仍取 last-completed record。
- 在 finish transaction 內重讀有效 `scan_interval_minutes`，並以 `next_due_at = max(last_completed_operation.completed_at, completed_at) + max(scan_interval_minutes * 60_000, 60_000)`（ISO instant）寫入；不再把舊 cycle 的 `next_interval_ms` 當成排程基準。`next_interval_ms` 僅可作由 `next_due_at - now` 計算的 backward-compatible display field，不是 authority。
- background runner 每次準備等待與每個 wait slice 醒來時，都重新讀取 persisted settings / `background_scan.next_due_at`；sleep 長度為 `min(30_000ms, max(0, next_due_at - now))`，到期才開新的 background operation。manual scan 在 runner 等待期間完成後，下一個 re-read 必須採用新的 `next_due_at`，不得沿用 start 時或上輪結果帶出的 timer。runner start delay 結束也走相同 re-read path。
- `background_scan` 的 start/finish writer 為 idempotent（按 `operation_id`）；SQLite `SQLITE_BUSY` / `SQLITE_LOCKED` 採用既有 busy timeout 後有限、帶 backoff 的 retry，僅重送這個 idempotent recorder mutation。耗盡後 scan outcome 對呼叫者為失敗並回安全的 `database_busy`，不得用另一個未標識操作覆寫 state。
- 前端 initial mount 立即讀一次 read-only snapshot；只要 `running_operations.length > 0`，以 5 秒 cadence polling，否則 60 秒。每次 response 只 merge `background_scan`、其 read-only `updated_at` 與 derived sidebar scan label；manual/global/project response 的 recorder snapshot 也必須立即 merge，不能等下一個 tick。polling 不得呼叫表單重置或 project-detail editor reset，也不得覆寫 dirty Settings、comment draft、daily diary editor 或目前 docs query。sidebar refresh icon / label 的 running 判斷來自 persisted runtime state（可再 OR 本地 request state），不是只有 `isScanRunning`。
- Codex canonical agent 的 `diary_capability.supported` 由 adapter 實作決定；保留安全 fallback、canonical executable resolver 與既有 settings migration。Codex adapter 的唯一 child-process argv 為 `[resolvedExecutable, 'exec', '--sandbox', 'read-only', '--ephemeral', '--cd', temporaryCwd, '--color', 'never', redactedPrompt]`，並以 `execFile` 執行且 `shell:false`。不得加入 `--dangerously-bypass-approvals-and-sandbox`、`--ignore-user-config`、`--ignore-rules`、`--config`、model override、resume 或 output-file option；因此仍載入使用者既有 `$CODEX_HOME/config.toml` 與 policy/rules，但 `--sandbox read-only` 是 adapter 的不可放寬上限。child env 僅 allowlist `HOME`、`PATH`、`LANG`、`LC_ALL`、`TERM`（必要時產品既有 Codex auth/config locator），不得轉送 app secrets 或任意 `process.env`。
- `temporaryCwd` 必須以 `mkdtemp` 建於 app-controlled temp parent、mode `0700`、不含 project source files；success、non-zero/timeout/parse failure、throw 與 cancellation 都由 `finally` recursive force-cleanup。只接受 non-empty Markdown stdout（受現有 timeout/maxBuffer 限制）；任何失敗回既有 deterministic fallback，不回傳 stderr、prompt、credential 或 temp path。只有 resolver 得到 regular executable 且這個 safe adapter 可建立時，Codex `diary_capability.supported` 才是 `true`；舊 persisted `default_diary_agent: 'codex-cli'` 在 adapter unavailable 時遷移為 `null` 並附安全 unsupported reason，available 時保留 selection。
- CLI card top-level 偵測列移除 Version / Binary path；可展開 CLI executable 區塊保留完整且可換行的 version、configured/resolved path、來源與狀態。
- `project_docs.updated_at` 是 source file 在 scan 時讀取的 `stat.mtime.toISOString()`，不是 DB ingest/upsert time；無法 stat/read 的 source 不得以 scan 現在時間偽造排序。`project_docs.name` 是 project-relative POSIX logical path：掃描寫入時將 `\\` 轉 `/`，拒絕 absolute、空白、NUL、`.`、`..` 或空 segment，並以 `/` join normalized segments。Core 以 `updated_at DESC, name ASC` 回傳；UI 使用 normalized path 的 dirname 自動建立 group key，並只在同 group 相鄰文件間顯示 group heading。搜尋以 filename + content 為資料來源，不建立全文索引或直接重新讀 filesystem。

## Non-goals

- 不讓 DevDiary 讀取、傳送或展示 Claude/Codex credential，也不執行 shell command。
- 不改動 CLI log scan 的 source-root security boundary，不新增 remote search、雲端索引或 user-controlled SQL。
- 不讓 manual scan 取消正在跑的 background cycle；兩者同時完成時，最後完成者就是下一輪的基準。
- 不依預設特定檔名或 `docs/` 字串硬編碼文件群組規則。

## Security / privacy boundary

- Codex adapter 只用 canonical executable resolver 的 resolved regular executable，以 `execFile`、固定 `exec` argv、temporary cwd、safe child env、timeout/maxBuffer 執行；prompt 只含既有 redact 後的 structured data。
- Project Docs 搜尋只在已經由 Core 安全掃描並持久化的 `name` / `content` 上進行；React 不讀檔，搜尋字串不作為 shell、SQL 或 path input。
- Scan state 為 Core-owned runtime metadata；所有 write 都必須在現有 settings mutation path 中 narrow merge，避免 background/manual settings races。

## 驗收條件

- [ ] Manual global / project scan 與 background scan 都只經 `recordScanOperation` 更新最近 scan state；start / success / failure / skipped、UUID/scope/project identity、並行 `running_operations` 與 terminal record 都有 Core integration tests。交錯案例至少包含 background start → manual completion → background completion，以及兩個完成 timestamp 相同的 deterministic tie-break；assert terminal fields/`next_due_at` 永不倒退。
- [ ] Runner test 在等待中寫入較新的 manual completion，驗證下一個最多 30 秒 re-read 採新 `next_due_at`，且不依舊 `next_interval_ms` 開 cycle。SQLite busy regression test 要同時覆蓋 recorder start/finish：busy timeout/retry 成功時 operation 不重複且 completion monotonic；retry 耗盡時回 `database_busy`、不假報 success、也不寫入未標識 completion。
- [ ] 背景 scan 進行時 sidebar refresh icon 轉動、顯示進行中；initial fetch、5 秒 running poll、60 秒 idle poll、manual response immediate merge 都有 UI fake-timer/API tests。每個 polling/assertion 都確認 dirty Settings、comment、daily diary、docs query 未被重設；desktop/mobile RWD 同時驗證 running label、長 CLI path、Docs search/group card 沒有截斷、重疊或 hidden control。
- [ ] 已偵測的 Claude 與 Codex CLI 都可被選為 Diary Agent；Claude/Codex fixture tests assert exact Codex argv、`shell:false`、read-only sandbox、ephemeral、user config/rules 未被 ignore、allowlisted env、0700 temporary cwd 與 success/failure/cancellation cleanup。測試 safe adapter available/unavailable 對 capability 與 persisted default selection migration 的結果；failure 只回 deterministic fallback。
- [ ] CLI Agents card 不重複 Version / Binary path；CLI executable 實際使用 path 在 desktop/mobile 可完整閱讀；活動記錄資料夾 button 使用 SVG folder icon。
- [ ] Docs fixture 以 source mtime（不是 ingest time）交錯排序，驗證 `updated_at DESC, name ASC`；同名但不同 logical path、Windows-style separator 輸入 normalization、absolute/traversal/empty/NUL rejection 與 root/nested path group 都有 Core/UI tests。filename 與內文搜尋可找出結果、清除後復原 source-mtime 排序與分組，desktop/mobile 沒有截斷或重疊。
- [ ] Core tests/typecheck、UI tests/build、security review、desktop/mobile smoke、safe runtime black-box QA、packaged macOS app smoke 通過。

## 影響範圍

- Core: `settings.ts`, `server.ts`, `backgroundRunner.ts`, diary agent adapter / agent capability contract, Project Docs read contract and tests.
- UI: `src/App.jsx`, project API mapping/tests, CSS/RWD.
- Docs: this delta, `doc/test/`, `MASTER.md` current-state index.
