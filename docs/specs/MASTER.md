# DevDiary — 專案規格總覽

> Last updated: 2026-09-25
> Source of truth: `openspec/specs/`；`openspec/changes/` 只放尚未封存的工作。
> Legacy 文件位於 `docs/specs/legacy/`，僅供 provenance 查閱，不是 active contract。

## 專案摘要

DevDiary 是 local-first 的 macOS desktop app，將使用者明確設定的 Claude Code、Codex CLI、Antigravity CLI 開發紀錄整理成 sessions、token analytics、daily diary、project docs、comments、Kanban 與 read-only Git snapshot。React/Tauri 是顯示與互動層，Node.js/TypeScript Core Engine 是檔案、CLI、SQLite、scheduler、export 與安全邊界的唯一入口。

## 規格索引

| Capability | Feature Spec | 狀態 | 中文摘要 |
|---|---|---|---|
| DevDiary macOS development diary | [`openspec/specs/dev-diary-macos-app/spec.md`](../../openspec/specs/dev-diary-macos-app/spec.md) | current / migrated | 已實作的 desktop-only app、Core API、掃描、Dashboard、Workspace、日記、scheduler、export 與隱私邊界的完整 current truth；窄於 768 CSS px 的 viewport 不在支援範圍。 |
| Codex Desktop multi-target quota auto-resume | [`openspec/specs/add-codex-desktop-auto-resume/spec.md`](../../openspec/specs/add-codex-desktop-auto-resume/spec.md) | current（2026-09-25 archive） | 以 deep link UUID 註冊多個 Codex Desktop 任務；只在註冊後的結構化額度事件且恢復時間已到時，背景以 `codex queue` 送固定「繼續」並開啟該任務；不確定一律停下待人工檢查；送出不保證 Codex 何時開始。 |

## 進行中變更

| Change | 目的 | 狀態 |
|---|---|---|
| （無） | 目前沒有進行中的 Change。`add-codex-desktop-auto-resume` 已於 2026-09-25 通過 3.1 O3 收門審查、3.4 獨立黑箱 QA 與 6.4 實機收尾（誠實記錄限制）後封存至 `openspec/changes/archive/2026-09-25-add-codex-desktop-auto-resume/`。 | — |

舊 Delta 的「後續」段落已由後續 commit 覆蓋，或是明確 deferred/non-goal；它們不會被假裝成 active work。

## 目前架構

- Desktop shell：Tauri；UI：React；Core：Node.js / TypeScript。
- Core ↔ UI：loopback-only Local HTTP API，`/api/health` 提供 contract version、capabilities、runtime identity 與 stale/unreachable 狀態；Codex resume mutation另綁定該次verified runtime snapshot，target drift在body parsing前zero mutation。
- System of record：本機 app-owned SQLite 與 app data folder；React 不直接讀 SQLite、project folder 或 agent logs。
- Project access：只掃描明確設定的 roots、agent source paths 與 docs allowlist；project folder 與 Git 操作對 app 而言是 read-only。
- Packaging：macOS Tauri app、bundled Node 22、manual-approval/ad-hoc-seal DMG、Applications drag-install metadata，以及 packaged startup 管理的 LaunchAgent runner；公開發布前會檢查現行 source／release notes 不含維護者機器專屬路徑。

## 現行功能

- **設定與 Agent**：Settings API/UI 持久化 roots、排除路徑、docs 規則、scan policy、scheduler、privacy、prompt 與 appearance；CLI Agents 支援 canonical source path、safe detection、custom-agent probe、enable/disable、model/reasoning 與 default diary agent；local Ollama 另支援由使用者設定 private host、model、thinking、timeout、context/output 與完整有界 sampling/runtime 選項。
- **掃描與資料**：global/project scan 經有總時限的隔離 worker 執行，單一 root traversal 與單檔讀取也各自有界；Claude/Codex JSONL 與 Antigravity glog/transcript metadata parser、stable source identity、SQLite mtime cache、project root discovery 與 sanitized scan warnings 已接入。packaged UI 不重複觸發 startup scan，Scan Now 只做本機匯入，不暗中串接逐專案 AI；每七日的 soft reconciliation 以兩次完整 root observation 標記 missing，保留所有歷史資料並在同路徑重現時自動恢復。
- **Dashboard**：range metrics、agent mix、project concentration、24 小時 hourly trend、latest-26-week heatmap、daily highlights 由 Core snapshot 提供。
- **Projects Workspace**：project detail、active/idle tracking、三欄 Kanban、manual status lock、AI-gated sync、comments、summary/daily diary writes、Project Docs 與 read-only Git Status。
- **Diary 與排程**：Claude/Codex/Antigravity/local Ollama draft providers、deterministic fallback、date-scoped diary；目標日固定、租約時鐘持續前進，長任務失去 owner/generation 時會 abort 並在交易內阻止後續 Project/Diary/Kanban/Highlight 寫入；每種輸出另有 provider success、fallback、failed、skipped 的可稽核 telemetry。只有目標日確實有 session 的專案產生 Daily diary，另有 scheduler preflight/Run now、sleep-like recovery tick 與關閉 app 後的 LaunchAgent background scan/diary gate。
- **Export 與 runtime**：Markdown daily export、redacted structured backup、dynamic Core-port manifest、Core在open DB前拒絕live/unknown舊owner且不得覆寫live manifest、只信任具有存活 owner PID 的 canonical runtime identity、startup retry；Codex resume old-schema migration須先證明舊Core與LaunchAgent/runner停止，Tauri取得exact migration-ready acknowledgement後才bootstrap新版runner。packaged LaunchAgent 可執行支援檔固定在 `.app` 同層的 `/Applications/.DevDiaryLaunchAgents`，development 仍使用 Application Support，SQLite 與 logs 一律留在 app-data boundary。

## 資料與 API 契約

完整欄位、Requirement 與 Scenario 請讀 [`dev-diary-macos-app Feature Spec`](../../openspec/specs/dev-diary-macos-app/spec.md)。主要入口如下：

| 類別 | 目前契約 |
|---|---|
| Read snapshots | `GET /api/health`, `/api/dashboard`, `/api/projects`, `/api/projects/:id`, `/api/settings`, `/api/scheduler/daily` |
| Scan / writes | `POST /api/scan`, `POST /api/projects/:id/scan`, comments、Kanban status、summary、date-scoped diary endpoints |
| Agents / scheduler | detection、custom-agent probe/write、`/api/scheduler/daily/preflight`、`POST /api/scheduler/daily/run` |
| Export | `/api/exports/daily` 與 `/api/exports/backup`；backup kind 是 `devdiary-redacted-backup` |
| Durable records | `projects`, `sessions`, `token_usage`, `daily_logs`, `comments`, `kanban_cards`, `project_docs`, `app_settings`, `daily_scheduler_runs`, `project_reconciliation_runs`, `log_file_scan_cache`；Codex 續跑另有 `codex_desktop_resume_state` 與 `codex_desktop_resume_targets` 專用表 |

## 測試與驗證

- Core automated tests 位於 `core/test/*.test.ts`，涵蓋 scan/parser/cache/discovery、dashboard/projects/writes/Git、diary、scheduler、runtime、settings、exports、custom agents、台北日界線與瀏覽器 Origin 授權。
- UI/API tests 位於 `src/api/*.test.js`，涵蓋 Core target、manifest owner PID、health retry、dashboard、projects、settings、shell/RWD contract 與 startup scan policy；Rust tests 另涵蓋 manifest 與 LaunchAgent 路徑／ownership。
- 本輪 fresh checks 包含 OpenSpec strict/preflight、Core 282 項、UI 80 項、Rust 21 項、Node 22 typecheck、production build、安裝版真實 `qwen3:8b` loopback provider、desktop-only 1280x820 UI、21 秒 29-project packaged scan、掃描中毫秒級 Core health、唯讀 SQLite integrity/counts、實際 LaunchAgent/Ollama 服務、App/DMG 簽章與獨立黑箱 QA。
- v0.1.3 已完成 local／remote `main`、immutable tag、GitHub Release 與 fresh-downloaded asset checksum readback；發布後只有純文件 closeout 可前進 `main`，不得移動已測試的 tag。
- 2026-09-25 Codex 續跑收尾：OpenSpec strict、Core 440 項、UI 83 項、Rust 24 項、typecheck、production build，隔離 Core 4417／Vite 5184 冷啟動獨立黑箱 QA 11/11 PASS（`doc/test/codex-desktop-auto-resume-closeout-qa-20260925.md`），以及安裝版 v0.1.4 三次真實額度恢復觸發（`doc/test/codex-desktop-unattended-start-closeout-20260925.md`）。目前公開 Release 只保留 v0.1.4。
- 這次已在授權的本機環境驗證 runtime DB、真實 Ollama provider、實際 launchctl/install 與可回復備份；仍不宣稱 Finder、OAuth、重開機恢復、Developer ID/notarization 或長時間 packaged soak。

## 營運與安全

- Core 僅使用 loopback；所有帶 Origin 的瀏覽器請求在 body parser 與 route 前比對精確可信 Origin，不受信、opaque 或偽裝 Origin 會以穩定 403 且零副作用拒絕。缺 Origin 僅保留給未被 Fetch Metadata 標示為 cross-site 的 native/CLI caller。
- Runtime manifest 只在 service、loopback host、合法 port、存活正整數 PID 與 optional URL 全部一致時才可信；其他情況使用有界 fallback，不由 consumer 改寫 manifest。
- Path-like settings 走 allowlist/normalization；symlink escape/cycle、malformed/unreadable inputs 與 provider failures 會 fail-safe。
- Custom-agent probe 使用 safe argv、bounded execution；Git snapshot 不得執行 mutating command。
- Export 只輸出 redacted structured data；不輸出 raw SQLite、secret-like value 或不必要的 private path。
- 現行公開 source、active specs 與 release notes 不得包含維護者 checkout、私人 volume／home 識別或 production demo root；immutable legacy provenance、匿名 fixture 與必要的 macOS platform candidate 保留。
- 本專案目前不具 production authentication、cloud sync、remote deletion 或 multi-user authorization 契約。

## 已知限制

- Antigravity metadata 可能缺 token usage，sessions 會保留低信心語意；這不是 token accuracy 的 production claim。
- Kanban v1 的 agent-authored wording 與 long-running provider soak 仍是 hardening；目前以 deterministic synthesis、Core validation、confidence、redaction、status-lock gate 為準。
- cost calculation / estimated cost、raw SQLite export、Developer ID/notarization、native sidecar、完整關閉期間 OS catch-up 的長時間 soak 都不是 current acceptance。
- no-Origin 的本機 native/CLI 相容路徑仍屬同一使用者的信任邊界，不是 production authentication；LaunchAgent 已完成一次安裝／升級與即時驗證，但長時間關閉 App、重開機與 sleep soak 仍未宣稱。
- 歷史 review-state 有部分只做靜態或局部 runtime evidence；請勿將 legacy review 記錄當成這一輪 fresh runtime proof。
- Codex 續跑只保證「排入 Codex 佇列」，不保證開始時間：安裝版三次真實觸發中兩次 10 秒內開始、一次因 Codex Desktop 自身延後約 8 小時。Mac 需保持醒著且登入可用桌面。UI 在 runtime stale 時仍未擋下 provider／reconciliation 儲存（既有缺口，列為後續）。

## 開放問題與延後事項

目前沒有未解決而阻塞 current Feature Spec 的問題。延後事項為明確的產品／硬化範圍：estimated cost、raw DB export、production auth/cloud boundary、Developer ID/notarization、native sidecar、長時間 packaged/sleep soak，以及更細緻的 AI Kanban 文案與 provider telemetry。若未來要把其中任一項變成承諾行為，必須在 `openspec/changes/<change>/` 建立 Proposal、Delta Spec、Design、Tasks 並完成 review/preflight。

## 變更紀錄

- 2026-09-25：封存 `add-codex-desktop-auto-resume`；新增 current Feature Spec `openspec/specs/add-codex-desktop-auto-resume/spec.md`（10 項 Requirement），並修改 dev-diary-macos-app 的 runtime 閘門為 contract v8 加完整 capability 集合。完成 O3 收門審查（先 REJECT 後修正 APPROVE）、獨立黑箱 QA 與實機限制誠實記錄。
- 2026-08-28：封存 `support-launchagent-on-external-home`；packaged LaunchAgent source 改用 launchd 可接受的 `/Applications/.DevDiaryLaunchAgents`，development 保持 Application Support。另完成掃描 root／單檔／整輪時限隔離、packaged startup 去重與 Scan Now/AI 邊界，並以安裝版 29-project scan、qwen3:8b、SQLite、LaunchAgent、簽章及獨立 QA 驗證。
- 2026-08-26：封存 `harden-daily-ai-local-providers-and-project-reconciliation`；Ollama 進階設定改由使用者完整控制且只接受 local/private origin，排程加入真實租約時鐘、generation fence、abort 與 typed telemetry，專案加入每七日、兩次確認、可恢復且不刪歷史資料的 missing reconciliation；Core/UI contract 更新為 v6。
- 2026-08-12：發布 v0.1.3 並封存 `release-v0-1-3-publication-hygiene`；版本 metadata、fresh App／DMG、immutable tag、GitHub Release 與下載 checksum 已對帳，現行公開 source 加入機器專屬路徑衛生邊界，舊版 release 維持不變。
- 2026-08-10：封存 `harden-local-runtime-boundaries`；Core 加入 pre-parser 精確 Origin 授權與跨站 Fetch Metadata 防護，所有 session 衍生日期標籤使用台北日界線，JS/Rust runtime manifest consumer 統一要求存活 PID，LaunchAgent 支援檔移至使用者 Application Support，並加入 revision-bound smoke／黑箱／安全驗證流程。
- 2026-08-05：封存 `use-same-taipei-day-diary-scheduler`；所有 session 日期／小時統一使用台北日界線，排程改為整理執行當日截至當下的活動，只替目標日確實有 session 的專案產生 Daily diary，並加入語意版本避免舊 success 阻止首次補跑。
- 2026-08-04：封存 `fix-automatic-daily-diary-input`；曾將 01:00 自動排程改為整理前一個台北日曆日，並補齊手動／自動共用的安全 session/commit prompt evidence；此日期策略已由 2026-08-05 Change 取代。
- 2026-07-26：封存 `remove-mobile-rwd-layout`；current Feature Spec 現明確定義 desktop-only presentation boundary，窄於 768 CSS px 的 viewport 不提供 mobile 重排、替代 markup 或提示。
- 2026-07-28：封存 `fix-scan-status-and-daily-diary-scheduler` 與 `release-v0-1-2-distribution`；current Feature Spec 已同步掃描／每日排程與 macOS Release provenance 契約。
- 2026-07-23：完成一次性 OpenSpec migration；current truth 轉入 `openspec/specs/`，legacy Feature/Delta/review/MASTER 保存於 `docs/specs/legacy/`。
- OpenSpec-native archive 從 `openspec/changes/archive/2026-08-10-harden-local-runtime-boundaries/` 起保存；更早的完整 legacy provenance 與舊 review state 由 [`MIGRATION-MAP.md`](legacy/MIGRATION-MAP.md) 對照。

- 2026-09-23：額度續跑新增 queue 後自動開啟精確任務，已安裝並通過受控啟動測試；真實背景執行仍觀察到 Desktop resume 延遲，因此不保證無人操作及時啟動。證據見 `doc/test/codex-desktop-wake-verification-report.md`。

- 2026-09-23：新增獨立本機續跑觀察與有限故障統計，General 診斷增量，不更改既有續跑觸發／派送／重播契約；驗證與安裝狀態見 `doc/test/codex-resume-observation.md`。整體無人操作可靠性仍待實際額度恢復驗證。
