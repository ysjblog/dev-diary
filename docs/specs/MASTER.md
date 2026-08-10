# DevDiary — 專案規格總覽

> Last updated: 2026-08-10
> Source of truth: `openspec/specs/`；`openspec/changes/` 只放尚未封存的工作。
> Legacy 文件位於 `docs/specs/legacy/`，僅供 provenance 查閱，不是 active contract。

## 專案摘要

DevDiary 是 local-first 的 macOS desktop app，將使用者明確設定的 Claude Code、Codex CLI、Antigravity CLI 開發紀錄整理成 sessions、token analytics、daily diary、project docs、comments、Kanban 與 read-only Git snapshot。React/Tauri 是顯示與互動層，Node.js/TypeScript Core Engine 是檔案、CLI、SQLite、scheduler、export 與安全邊界的唯一入口。

## 規格索引

| Capability | Feature Spec | 狀態 | 中文摘要 |
|---|---|---|---|
| DevDiary macOS development diary | [`openspec/specs/dev-diary-macos-app/spec.md`](../../openspec/specs/dev-diary-macos-app/spec.md) | current / migrated | 已實作的 desktop-only app、Core API、掃描、Dashboard、Workspace、日記、scheduler、export 與隱私邊界的完整 current truth；窄於 768 CSS px 的 viewport 不在支援範圍。 |

## 進行中變更

目前沒有進行中的 OpenSpec Change。

舊 Delta 的「後續」段落已由後續 commit 覆蓋，或是明確 deferred/non-goal；它們不會被假裝成 active work。

## 目前架構

- Desktop shell：Tauri；UI：React；Core：Node.js / TypeScript。
- Core ↔ UI：loopback-only Local HTTP API，`/api/health` 提供 contract version、capabilities、runtime identity 與 stale/unreachable 狀態。
- System of record：本機 app-owned SQLite 與 app data folder；React 不直接讀 SQLite、project folder 或 agent logs。
- Project access：只掃描明確設定的 roots、agent source paths 與 docs allowlist；project folder 與 Git 操作對 app 而言是 read-only。
- Packaging：macOS Tauri app、bundled Node 22、manual-approval/ad-hoc-seal DMG、Applications drag-install metadata，以及 packaged startup 管理的 LaunchAgent runner。

## 現行功能

- **設定與 Agent**：Settings API/UI 持久化 roots、排除路徑、docs 規則、scan policy、scheduler、privacy、prompt 與 appearance；CLI Agents 支援 canonical source path、safe detection、custom-agent probe、enable/disable、model/reasoning 與 default diary agent。
- **掃描與資料**：global/project scan 經 Core endpoint 執行；Claude/Codex JSONL 與 Antigravity glog/transcript metadata parser、stable source identity、SQLite mtime cache、project root discovery 與 scan warnings 已接入。
- **Dashboard**：range metrics、agent mix、project concentration、24 小時 hourly trend、latest-26-week heatmap、daily highlights 由 Core snapshot 提供。
- **Projects Workspace**：project detail、active/idle tracking、三欄 Kanban、manual status lock、AI-gated sync、comments、summary/daily diary writes、Project Docs 與 read-only Git Status。
- **Diary 與排程**：Claude/Codex/Antigravity/local Ollama draft providers、deterministic fallback、date-scoped diary；自動排程整理執行當下的台北日（例如 01:00 僅含當日 00:00 至執行前已掃描資料），只有該日確實有 session 的專案產生 Daily diary，手動與自動共用已清理、有長度上限的 session/commit evidence；另有 scheduler preflight/Run now、sleep-like recovery tick、語意升級防漏跑與關閉 app 後的 LaunchAgent background scan/diary gate。
- **Export 與 runtime**：Markdown daily export、redacted structured backup、dynamic Core-port manifest、只信任具有存活 owner PID 的 canonical runtime identity、startup retry，以及將 LaunchAgent 支援檔固定放在使用者 Application Support 的 packaged Core lifecycle。

## 資料與 API 契約

完整欄位、Requirement 與 Scenario 請讀 [`dev-diary-macos-app Feature Spec`](../../openspec/specs/dev-diary-macos-app/spec.md)。主要入口如下：

| 類別 | 目前契約 |
|---|---|
| Read snapshots | `GET /api/health`, `/api/dashboard`, `/api/projects`, `/api/projects/:id`, `/api/settings`, `/api/scheduler/daily` |
| Scan / writes | `POST /api/scan`, `POST /api/projects/:id/scan`, comments、Kanban status、summary、date-scoped diary endpoints |
| Agents / scheduler | detection、custom-agent probe/write、`/api/scheduler/daily/preflight`、`POST /api/scheduler/daily/run` |
| Export | `/api/exports/daily` 與 `/api/exports/backup`；backup kind 是 `devdiary-redacted-backup` |
| Durable records | `projects`, `sessions`, `token_usage`, `daily_logs`, `comments`, `kanban_cards`, `project_docs`, `app_settings`, `log_file_scan_cache` |

## 測試與驗證

- Core automated tests 位於 `core/test/*.test.ts`，涵蓋 scan/parser/cache/discovery、dashboard/projects/writes/Git、diary、scheduler、runtime、settings、exports、custom agents、台北日界線與瀏覽器 Origin 授權。
- UI/API tests 位於 `src/api/*.test.js`，涵蓋 Core target、manifest owner PID、health retry、dashboard、projects、settings、shell/RWD contract 與 startup scan policy；Rust tests 另涵蓋 manifest 與 LaunchAgent 路徑／ownership。
- 本輪 fresh checks 包含 `openspec validate --specs --strict --no-interactive`、`spec_author_preflight.py --all-current`、完整 Core/UI/Rust suites、in-memory loopback smoke、desktop-only 1280x820 UI 與獨立黑箱／安全檢查。
- 這次不宣稱使用私人 runtime DB、真人 provider、實際 launchctl/install、Finder、OAuth 或長時間 packaged soak；這些限制見下節與 migration map。

## 營運與安全

- Core 僅使用 loopback；所有帶 Origin 的瀏覽器請求在 body parser 與 route 前比對精確可信 Origin，不受信、opaque 或偽裝 Origin 會以穩定 403 且零副作用拒絕。缺 Origin 僅保留給未被 Fetch Metadata 標示為 cross-site 的 native/CLI caller。
- Runtime manifest 只在 service、loopback host、合法 port、存活正整數 PID 與 optional URL 全部一致時才可信；其他情況使用有界 fallback，不由 consumer 改寫 manifest。
- Path-like settings 走 allowlist/normalization；symlink escape/cycle、malformed/unreadable inputs 與 provider failures 會 fail-safe。
- Custom-agent probe 使用 safe argv、bounded execution；Git snapshot 不得執行 mutating command。
- Export 只輸出 redacted structured data；不輸出 raw SQLite、secret-like value 或不必要的 private path。
- 本專案目前不具 production authentication、cloud sync、remote deletion 或 multi-user authorization 契約。

## 已知限制

- Antigravity metadata 可能缺 token usage，sessions 會保留低信心語意；這不是 token accuracy 的 production claim。
- Kanban v1 的 agent-authored wording 與 long-running provider soak 仍是 hardening；目前以 deterministic synthesis、Core validation、confidence、redaction、status-lock gate 為準。
- cost calculation / estimated cost、raw SQLite export、Developer ID/notarization、native sidecar、完整關閉期間 OS catch-up 的長時間 soak 都不是 current acceptance。
- no-Origin 的本機 native/CLI 相容路徑仍屬同一使用者的信任邊界，不是 production authentication；實際 LaunchAgent 安裝／升級與長時間關閉 App soak 仍需另行授權驗證。
- 歷史 review-state 有部分只做靜態或局部 runtime evidence；請勿將 legacy review 記錄當成這一輪 fresh runtime proof。

## 開放問題與延後事項

目前沒有未解決而阻塞 current Feature Spec 的問題。延後事項為明確的產品／硬化範圍：estimated cost、raw DB export、production auth/cloud boundary、Developer ID/notarization、native sidecar、長時間 packaged/sleep soak，以及更細緻的 AI Kanban 文案與 provider telemetry。若未來要把其中任一項變成承諾行為，必須在 `openspec/changes/<change>/` 建立 Proposal、Delta Spec、Design、Tasks 並完成 review/preflight。

## 變更紀錄

- 2026-08-10：封存 `harden-local-runtime-boundaries`；Core 加入 pre-parser 精確 Origin 授權與跨站 Fetch Metadata 防護，所有 session 衍生日期標籤使用台北日界線，JS/Rust runtime manifest consumer 統一要求存活 PID，LaunchAgent 支援檔移至使用者 Application Support，並加入 revision-bound smoke／黑箱／安全驗證流程。
- 2026-08-05：封存 `use-same-taipei-day-diary-scheduler`；所有 session 日期／小時統一使用台北日界線，排程改為整理執行當日截至當下的活動，只替目標日確實有 session 的專案產生 Daily diary，並加入語意版本避免舊 success 阻止首次補跑。
- 2026-08-04：封存 `fix-automatic-daily-diary-input`；曾將 01:00 自動排程改為整理前一個台北日曆日，並補齊手動／自動共用的安全 session/commit prompt evidence；此日期策略已由 2026-08-05 Change 取代。
- 2026-07-26：封存 `remove-mobile-rwd-layout`；current Feature Spec 現明確定義 desktop-only presentation boundary，窄於 768 CSS px 的 viewport 不提供 mobile 重排、替代 markup 或提示。
- 2026-07-28：封存 `fix-scan-status-and-daily-diary-scheduler` 與 `release-v0-1-2-distribution`；current Feature Spec 已同步掃描／每日排程與 macOS Release provenance 契約。
- 2026-07-23：完成一次性 OpenSpec migration；current truth 轉入 `openspec/specs/`，legacy Feature/Delta/review/MASTER 保存於 `docs/specs/legacy/`。
- OpenSpec-native archive 從 `openspec/changes/archive/2026-08-10-harden-local-runtime-boundaries/` 起保存；更早的完整 legacy provenance 與舊 review state 由 [`MIGRATION-MAP.md`](legacy/MIGRATION-MAP.md) 對照。
