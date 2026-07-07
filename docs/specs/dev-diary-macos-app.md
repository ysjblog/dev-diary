# 自動開發日記 macOS App Spec

> Status: implemented
> Created: 2026-06-27
> Project folder: `~/Workspace/side-projects/Development log`
> Source inputs:
> - `~/Downloads/自動開發日記功能需求書.pdf`
> - `~/Workspace/side-projects/Development log UI/自動開發日記 macOS App UI 設計需求書.pdf`
> - Open Design UI draft shared in kickoff discussion
> - `~/Library/Application Support/Open Design/namespaces/release-stable/data/projects/990a3245-c1fd-40ce-b469-5553f74440a4`

## 1. Product Summary

自動開發日記是一個 local-first macOS desktop app，用來自動收集、整理與視覺化使用者透過 CLI coding agent 進行開發時產生的紀錄。

產品定位不是傳統手寫日記，而是：

- AI coding activity dashboard
- project development diary
- local token and session analytics
- project progress workspace

v1 服務單人開發者，尤其是同時使用 Claude Code、Codex CLI、Antigravity CLI，並維護多個 side project 或正式專案的人。

## 2. Goals

v1 必須讓使用者可以：

- 完成 macOS app guided onboarding。
- 偵測本機 Claude Code、Codex CLI、Antigravity CLI。
- 選擇一個或多個 project root folders。
- 掃描 root folders 下的 project folders。
- 以 read-only 方式讀取 project metadata、project documents 與 CLI logs。
- 解析至少 Claude Code 與 Codex CLI logs，Antigravity parser 可標記 experimental。
- 統計 daily / project / agent / model / session token usage。
- 每日固定時間自動產生 AI development diary summary。
- 在 AI summary 失敗時顯示 deterministic fallback report。
- 在 Dashboard 查看今日整體開發狀態。
- 在 Dashboard 以 24h / 7d / 1m / custom / all-time 範圍查看 token、session 與 agent usage。
- 手動觸發 local scan / refresh，並看到掃描中與完成狀態。
- 在 Projects Workspace 管理 project status、查看 summaries、tokens、docs、sessions、comments。
- 手動覆蓋或編輯 AI summary。
- 以日期與關鍵字搜尋 project diary blocks。
- 查看 read-only Git repository status、commit history、worktree 與 diff summary。
- 管理 CLI agents：啟用/停用、移除、新增 custom agent 並進行本機連線測試。
- 設定 app appearance：light / dark / follow macOS system。
- 匯出 Markdown daily diary。
- 匯出或備份 app-owned SQLite data。
- build 出可分享的 unsigned `.app` / `.dmg`。

## 3. Non-Goals

v1 明確不做：

- 使用者登入。
- cloud sync。
- team / multi-user permissions。
- cost calculation。
- signed + notarized app。
- LaunchAgent background runner。
- marketplace plugin system。
- full weekly / monthly reports。
- full unknown-agent support。
- automatic commit。
- direct project file patching。
- Git branch / worktree cleanup。
- 修改 project folder 內任何檔案。
- 修改 `master.md`、spec、delta spec。
- 讓 AI Diary Agent 讀完整 project files。
- 讓 UI 直接操作 SQLite。
- 讓 UI 直接解析 CLI logs。
- Dashboard 常態顯示「明日建議」。

只有在 blocker、warning、failed summary、parser warning 等異常狀態時，UI 才可顯示處理建議。

Open Design prototype 中出現的 cost 欄位與 `預估成本 (USD)` 在 v1 視為 design-only placeholder。只要 `cost calculation` 仍是 Non-Goal，正式 UI、API、export 與 backup 不得顯示或輸出 estimated cost。

## 4. Core Principles

### 4.1 Local-first

所有原始資料、解析後資料、AI 摘要與使用者手動編輯內容，預設儲存在本機。

預設正式資料位置：

```text
~/Library/Application Support/DevDiary/
```

本專案開發資料夾：

```text
~/Workspace/side-projects/Development log
```

developer / test mode 可使用下列測試資料 preset，但不可成為一般使用者預設值：

```text
~/Projects
~/Workspace/side-projects
```

### 4.2 Read-only Project Access

App 對使用者 project folders 只能 read-only。

禁止：

- 修改 project folder 內任何檔案。
- 修改 `master.md`、spec、delta spec。
- 自動建立 commit。
- 自動刪除 project files。
- 自動移動 project folders。

允許：

- 讀取 project metadata。
- 讀取 project documents 並產生 app 內 summary。
- 讀取 git metadata。
- 讀取 CLI logs。
- 在 app data folder 建立 records、indexes、summaries、statistics、comments。

所有 app data folder / SQLite 寫入只能由 Core Engine 執行。React UI 和 custom / AI agents 不可直接寫 SQLite；它們只能透過 Core API 送出使用者操作或 structured output，由 Core Engine 驗證、清理、持久化。

### 4.3 Manual Override

所有 AI 產生內容可自動建立並顯示，但使用者永遠可以手動編輯、修正或覆蓋。

使用者手動內容是 app 內顯示與匯出的最高優先版本。

AI regenerate 必須更新 AI draft，不可直接覆蓋 user override。若使用者已有手動版本，UI 必須讓使用者明確選擇是否接受新的 AI draft；顯示與匯出仍優先使用 user override。

### 4.4 Open-source Ready

架構必須支援：

- GUI setup。
- manual config。
- Agent Adapter config。
- 社群未來新增 CLI agent support。
- 使用者可叫自己的 AI agent 協助設定。

## 5. User Workflow

### 5.1 First Launch Onboarding

第一次開啟 app 時進入 guided onboarding wizard：

1. Welcome。
2. Scan CLI agents。
3. Select project root folders。
4. Scan candidate projects。
5. Select AI diary agent and data storage location。
6. Complete and enter Dashboard。

每一步都必須有 loading、empty、error、manual override 狀態。

Open Design prototype currently groups AI diary agent and storage into the same final onboarding step. This is accepted for v1 if the screen remains clear and editable.

Completing onboarding requires either:

- a successful candidate project scan, or
- an explicit manual override / skip state with persisted reason.

The app must not silently enter Dashboard with unknown project scan status.

### 5.2 Daily Workflow

每日固定時間：

1. App scheduler 觸發 scan。
2. Core Engine 掃描 project roots 與 CLI logs。
3. Adapter Layer 解析 sessions、timestamps、project paths、tokens、models、transcripts。
4. Core Engine 更新 SQLite。
5. AI Diary Agent 讀取 structured data package。
6. AI Diary Agent 產生 global daily summary 與 per-project daily summaries。
7. Core Engine 將結果寫入 app data folder / SQLite。
8. UI 顯示 Dashboard 與 Projects Workspace 更新。

若 AI summary 失敗：

- UI 顯示清楚錯誤原因。
- UI 顯示 deterministic fallback report。
- 使用者可以 manual retry。
- 失敗不可阻斷 token statistics 與 session visibility。

使用者也可以在 Dashboard sidebar 或 header 手動觸發 `Scan Now` / `更新日誌`。手動掃描必須走與 scheduler 相同的 read-only Core Engine path，並顯示 scanning、success、failure 狀態。

Manual global scan and project rescan must be idempotent:

- identify sessions by stable source log / session identity。
- do not create duplicate sessions, diary blocks, or Kanban cards on repeated scans。
- respect project root whitelist, excluded paths, ignored projects, `scan_paused`, and privacy settings。
- project rescan is scoped to the selected project unless the user explicitly runs global scan。
- update Dashboard metrics, last scan time, project metrics, and scan status only after Core persistence succeeds。

### 5.3 Projects Workspace Workflow

Projects / Project Detail / Board / Logs / Token / Comments 整合成 Projects Workspace。

Workspace 結構：

- left panel: project list, search, filters, sort。
- right panel: selected project detail。
- detail sections / tabs:
  - Kanban
  - Auto Diary Summary
  - Git Status
  - Token Detail
  - Memo Comments
  - Project Docs
  - Sessions

Kanban 欄位：

- `todo` / 待處理
- `in_progress` / 進行中
- `done` / 已完成

status changes 只寫入 app data，不可修改 project files。

Open Design prototype renders `todo`, `in_progress`, `done`, and this is the accepted v1 Kanban scope. Do not expand Workspace Kanban to five columns in v1.

Project tracking states such as `active` / `idle` / `paused` are separate from Kanban card statuses. Future archive or pause workflows may add project-level controls later, but they must not create extra Kanban columns unless explicitly re-approved.

Workspace header must support:

- selected project name and root path。
- last activity indicator。
- open folder / Reveal in Finder action。
- rescan project action。
- project-level time range filter, including custom date range。
- metric strip: today token, weekly token, monthly token, cumulative token, total sessions, AI summary status。

## 6. Architecture

### 6.1 Stack

- Desktop shell: Tauri。
- UI: React。
- Core Engine: Node.js / TypeScript。
- Core/UI communication: Local HTTP API。
- Storage: SQLite + app data folder。
- Packaging target: unsigned `.app` / `.dmg` for v1。

### 6.2 Responsibility Boundaries

Tauri / Rust layer 負責：

- app shell。
- macOS permissions。
- starting / stopping Core sidecar。
- window management。
- packaging。

TypeScript Core Engine 負責：

- Local HTTP API。
- SQLite / storage access。
- project scanning orchestration。
- CLI log adapter / parser。
- token aggregation。
- AI summary orchestration。
- app scheduler。
- structured data package generation。
- safe custom agent executable probing。

React UI 負責：

- rendering data from Core API。
- user interactions。
- updating app-owned user edits through Core API。
- onboarding and settings UI。

React UI 不可：

- directly read project folders。
- directly parse CLI logs。
- directly query or mutate SQLite。
- execute shell commands that modify projects。
- directly execute custom agent connection tests。
- display copy implying that UI or agents write directly to SQLite.

### 6.3 Local HTTP API

The Core Engine exposes a local HTTP API consumed by the Tauri/React UI.

Port strategy is implemented:

- development Core starts on the preferred loopback port when available, otherwise falls back to the next available loopback port.
- development UI discovers Core through `DEVDIARY_CORE_URL`, then the redacted runtime manifest, then the legacy fallback port.
- packaged Tauri runtime starts and targets the loopback Core sidecar endpoint.

The API must not be exposed as a remote network service.

## 7. Data Model

### 7.1 Project

- `id`
- `name`
- `root_path`
- `tracking_status` (`active`, `idle`, `paused`)
- `created_at`
- `last_activity_at`
- `detected_agents`
- `ignored`
- `scan_paused`
- `git_repo_detected`
- `git_branch`
- `git_worktree_count`

`tracking_status` answers whether the app is currently seeing activity or tracking the project. UI labels such as Active / Idle must not be reused as Kanban card status values.

### 7.1.1 KanbanCard

Workspace Kanban status belongs to project task cards, not to the Project record itself.

- `id`
- `project_id`
- `title`
- `description`
- `status` (`todo`, `in_progress`, `done`)
- `assignee_agent_id` nullable
- `due_date` nullable
- `source_ref` nullable
- `created_at`
- `updated_at`

KanbanCard.status is the only v1 Kanban workflow enum. Project.tracking_status and KanbanCard.status must remain separate contracts.

### 7.2 Session

- `id`
- `project_id`
- `agent_name`
- `model`
- `start_time`
- `end_time`
- `token_total`
- `token_input`
- `token_cached`
- `token_output`
- `token_reasoning`
- `summary`
- `source_log_ref`
- `parser_confidence`
- `command`
- `duration`
- `status`
- `redacted_log_excerpt`
- `task_count` nullable, derived from parser / summary extraction when available
- `transcript_length` nullable, measured after redaction / normalization

### 7.3 TokenUsage

- `date`
- `project_id`
- `agent_name`
- `model`
- `token_total`
- `token_input`
- `token_cached`
- `token_output`
- `token_reasoning`

### 7.3.1 DashboardRangeMetric

Derived by Core API for `all`, `24h`, `7d`, `1m`, or custom `start_date` / `end_date`:

- `range_key`
- `start_date` nullable for all-time
- `end_date` nullable for all-time
- `token_total`
- `session_count`
- `active_project_count`
- `primary_agent_name`
- `primary_agent_token_percentage`
- `blocker_count`
- `warning_count`
- `unconfirmed_summary_count`
- `comparison_delta_percentage` nullable

Custom date ranges must aggregate real persisted `TokenUsage`, `Session`, `DailyLog`, and project activity records. The Open Design prototype's proportional `computeRangeData` mock is prototype-only and must not become the production calculation.

### 7.3.2 DashboardAgentMix

Derived by Core API for the selected Dashboard range:

- `agent_name`
- `agent_id`
- `token_total`
- `percentage`
- `color_key`

The Dashboard donut chart and CLI call ratio bars must use the same normalized selected-range `DashboardAgentMix` dataset so percentages and totals cannot disagree.

### 7.3.3 DashboardActivityCell

Derived by Core API for the selected Dashboard range and rendered as the activity heatmap:

- `date`
- `project_id` nullable for global view
- `session_count`
- `token_total`
- `transcript_length`
- `task_count`
- `intensity_level` (`0`, `1`, `2`, `3`, `4`)
- `dominant_agent_id` nullable

Heatmap cells must be deterministic for the same persisted data and selected range. The Open Design prototype's random heatmap intensity and random click detail are demo-only placeholders.

### 7.3.4 DashboardTrendSeries

Derived by Core API for the selected Dashboard range:

- `range_key`
- `bucket_start`
- `bucket_end`
- `series_key` (`total`, `claude-code`, `codex-cli`, `antigravity-cli`, `other`)
- `token_total`
- `session_count`

The token trend chart must support total plus each canonical agent bucket, including Claude Code, Codex CLI, Antigravity CLI, and other. The Open Design prototype currently exposes only total, Claude, and Antigravity toggles; production must add the missing Codex and other buckets or hide filters only when the returned series is truly unavailable.

### 7.4 DailyLog

- `date`
- `global_summary_ai`
- `global_summary_user`
- `per_project_summary`
- `blockers`
- `warnings`
- `fallback_report`
- `summary_status`

### 7.5 DiaryEntry

- `id`
- `date`
- `project_id` nullable
- `title`
- `markdown_ai`
- `markdown_user`
- `source_daily_log_id`
- `created_at`
- `updated_at`

### 7.6 DocumentSummary

- `project_id`
- `type` (`master`, `spec`, `delta`, `readme`, `agent_instructions`, `other`)
- `source_path`
- `summary_ai`
- `preview_content`
- `last_updated`

### 7.7 Comment

- `id`
- `project_id` nullable
- `content`
- `tags`
- `pinned`
- `created_at`
- `updated_at`

### 7.8 GitStatusSnapshot

- `project_id`
- `captured_at`
- `main_branch`
- `current_branch`
- `branch_relationship`
- `working_tree_status`
- `linked_worktrees`
- `upstream_health`
- `recent_commits`
- `diff_added_lines`
- `diff_changed_lines`
- `diff_deleted_lines`

### 7.9 Prototype DTO Mapping

Open Design HTML uses prototype-only mock fields. Implementation must map them to the canonical API/data model instead of adopting mock names directly:

- `project.path` -> `Project.root_path`
- `project.status` (`active` / `idle`) -> `Project.tracking_status`
- `project.tokensCount` -> aggregated `TokenUsage.token_total`
- `project.logsCount` -> derived diary / session count
- `project.blockers[]` -> `DailyLog.blockers` or project-scoped warning/blocker records; do not persist as raw Project fields
- `tokens[].input` -> `TokenUsage.token_input`
- `tokens[].output` -> `TokenUsage.token_output`
- `tokens[].agent` -> `TokenUsage.agent_name` after canonical agent alias normalization
- `tokens[].cost` -> omitted in v1 while cost calculation is Non-Goal
- `sessions[].cmd` -> `Session.command`
- `sessions[].time` -> `Session.start_time` / `Session.end_time`
- `sessions[].logs` -> `Session.redacted_log_excerpt`
- `sessions[].tokens` -> `Session.token_total`
- `INITIAL_KANBAN[].title` -> `KanbanCard.title`
- `INITIAL_KANBAN[].desc` -> `KanbanCard.description`
- `INITIAL_KANBAN[].status` -> `KanbanCard.status`
- `INITIAL_KANBAN[].projectId` -> `KanbanCard.project_id`
- `INITIAL_KANBAN[].assignee` -> `KanbanCard.assignee_agent_id` after canonical agent alias normalization
- `INITIAL_KANBAN[].date` -> `KanbanCard.due_date` only when it represents an intended due date; otherwise keep it UI-only and do not persist as a source timestamp
- `comments[].text` -> `Comment.content`
- `comments[].tags` -> `Comment.tags`
- `comments[].pinned` -> `Comment.pinned`
- `comments[].date` -> `Comment.created_at` when it represents creation time; otherwise treat as display-only mock data
- `docs[].name` -> `DocumentSummary.source_path` or display title derived from source path
- `docs[].content` -> `DocumentSummary.preview_content` after redaction and length limits
- `RANGE_DATA.tokens` -> `DashboardRangeMetric.token_total`
- `RANGE_DATA.sessions` -> `DashboardRangeMetric.session_count`
- `RANGE_DATA.primary` -> `DashboardRangeMetric.primary_agent_name`
- `RANGE_DATA.pct` -> `DashboardRangeMetric.primary_agent_token_percentage`
- `RANGE_AGENT_MIX.total` -> selected `DashboardRangeMetric.token_total`
- `RANGE_AGENT_MIX.data[].name` -> `DashboardAgentMix.agent_name`
- `RANGE_AGENT_MIX.data[].pct` -> `DashboardAgentMix.percentage`
- `RANGE_AGENT_MIX.data[].color` / `className` -> UI-only derived styling from `DashboardAgentMix.color_key`
- `GIT_STATUS_BY_PROJECT[].main` -> `GitStatusSnapshot.main_branch`
- `GIT_STATUS_BY_PROJECT[].branch` -> `GitStatusSnapshot.current_branch`
- `GIT_STATUS_BY_PROJECT[].relation` -> `GitStatusSnapshot.branch_relationship`
- `GIT_STATUS_BY_PROJECT[].workingTree` -> `GitStatusSnapshot.working_tree_status`
- `GIT_STATUS_BY_PROJECT[].worktrees` -> `GitStatusSnapshot.linked_worktrees`
- `GIT_STATUS_BY_PROJECT[].upstreamHealth` -> `GitStatusSnapshot.upstream_health`
- `GIT_STATUS_BY_PROJECT[].commits` -> `GitStatusSnapshot.recent_commits`
- `GIT_STATUS_BY_PROJECT[].diff.added` -> `GitStatusSnapshot.diff_added_lines`
- `GIT_STATUS_BY_PROJECT[].diff.changed` -> `GitStatusSnapshot.diff_changed_lines`
- `GIT_STATUS_BY_PROJECT[].diff.deleted` -> `GitStatusSnapshot.diff_deleted_lines`
- `diaryEntries[].markdown` -> `DiaryEntry.markdown_ai` for generated text or `DiaryEntry.markdown_user` after user save / override
- `selectedProject.logs` -> source summary text for `DailyLog.per_project_summary` or `DiaryEntry.markdown_ai`; it must not become a Project field in the canonical model

Prototype model strings such as `Gemini-2.0-Flash`, `Gemini-1.5-Pro`, `Claude-3.5-Sonnet`, `claude-opus-4-7`, `antigravity-core`, and `unknown` are display aliases or demo-only derived labels until verified against real adapter output. Persisted `Session.model` and `TokenUsage.model` must use normalized model identifiers from parsed CLI logs or adapter metadata; `unknown` may persist only as an explicit low-confidence parser result.

Canonical agent identifiers:

- `claude-code` -> display name `Claude Code`
- `codex-cli` -> display name `Codex CLI`
- `antigravity-cli` -> display name `Antigravity CLI`

Prototype labels such as `Claude Code Core` and `Codex CLI Engine` are accepted aliases, not canonical names.

Prototype id aliases must be normalized before persistence:

- `codex` -> `codex-cli`
- `claude` -> `claude-code`
- `agy` -> `antigravity-cli`

## 8. Agent Detection and Adapter Layer

### 8.1 Default Supported Agents

MVP supports:

- Claude Code
- Codex CLI
- Antigravity CLI

Claude Code and Codex CLI parsers are required for MVP.

Antigravity parser may be experimental, but the app must display its parser status clearly.

### 8.2 Detection Status

Each agent must expose:

- detected / not detected / path needs confirmation
- executable path
- log path found / log path not found
- parser available / parser experimental
- enabled / disabled
- last session
- today token

### 8.3 Adapter Config

Adapter config should be JSON or YAML and include:

- `adapter_name`
- `agent_name`
- `executable_detection_commands`
- `default_log_paths`
- `log_file_patterns`
- `parser_type`
- `timestamp_field`
- `project_path_strategy`
- `token_strategy`
- `transcript_strategy`
- `session_boundary_strategy`
- `supported_versions`
- `experimental_flag`

## 9. AI Diary Agent

### 9.1 Default and Fallback

使用者可選擇 Diary Agent。

Default preference:

1. Antigravity CLI
2. Codex CLI
3. Claude Code
4. custom agent

### 9.2 Permission Boundary

AI Diary Agent can only read structured data package.

Allowed package contents:

- parsed session summaries
- token usage table
- project metadata
- project document summaries
- user comments
- previous daily logs

Forbidden:

- writable project folder access
- shell command permission to modify projects
- raw secrets
- unnecessary full project files
- direct full project file reading

### 9.3 Output

AI Diary Agent outputs:

- daily global summary focused on outcomes
- per-project daily summary
- completed features / fixed bugs / completed tasks
- session activity digest
- token usage summary as data only

It should not routinely output future recommendations.

## 10. Dashboard

Dashboard answers: selected range development status, defaulting to today / recent 24h.

Required sections:

- Time range selector:
  - all-time
  - recent 24 hours
  - recent 7 days
  - recent 1 month
  - custom start / end date

Open Design prototype currently has no visible all-time button; it falls back to all-time after clearing custom date. Implementation must add an explicit all-time / cumulative selector.
- Top metric cards:
  - selected range total token from `DashboardRangeMetric.token_total`
  - active projects from `DashboardRangeMetric.active_project_count`
  - selected range sessions from `DashboardRangeMetric.session_count`
  - most used agent from `DashboardRangeMetric.primary_agent_name`
  - optional unconfirmed AI summaries from `DashboardRangeMetric.unconfirmed_summary_count`
  - optional blockers / warnings from `DashboardRangeMetric.blocker_count` and `warning_count`
- Sidebar quick stats:
  - 24h token
  - active project count
  - 24h sessions
  - last scan time
  - manual scan button
- Token trend:
  - 24h / 7d / 1m / custom / all-time
  - total / Claude / Codex / Antigravity / other
  - optional cumulative token line
  - data source: `DashboardTrendSeries`
- Agent token donut chart for the selected range using `DashboardAgentMix`; center label shows selected-range token total only.
- Project activity heatmap:
  - session count
  - total tokens
  - transcript length
  - AI detected task count
  - clickable heatmap cell showing date / activity detail
- Agent usage breakdown using the same `DashboardAgentMix` dataset as the donut chart。
- Condensed AI global summary。
- Optional action item / follow-up item may be shown only as part of the daily summary content.

MVP heatmap must not depend on `modified file count`, random values, or client-only mock generation. Its intensity should be derived from selected-range `DashboardActivityCell` values, with a documented weighting rule such as token total first, session count second, and task count third.

Dashboard render order:

1. UI sends the selected Dashboard range to Core API.
2. Core validates and canonicalizes `start_date` / `end_date`, including reversed dates, before issuing any persisted aggregation query.
3. Core queries persisted records using only the canonical `start_date` / `end_date`.
4. Core returns one aggregate snapshot with `range_key`, canonical dates, `captured_at`, `DashboardRangeMetric`, `DashboardAgentMix`, `DashboardTrendSeries`, and `DashboardActivityCell`.
5. UI renders metric cards, donut, breakdown, token trend, and heatmap from that same snapshot.
6. While the snapshot is loading, stale, or invalid, UI must show loading / stale / validation error state instead of falling back to client mock or proportional values in production.

## 11. Projects Workspace

Projects Workspace is the primary project management surface.

Required capabilities:

- project list。
- search。
- filters by status / agent / activity。
- sorting by token / activity / name。
- selected project details。
- project status update。
- rescan project。
- open project folder in Finder。
- ignore project。
- pause tracking。
- comments。
- comment tags, pinning, deletion, and filters。
- document summaries。
- document preview modal。
- sessions list。
- token detail。
- date and keyword search for diary blocks。
- markdown-aware AI summary editor and preview。
- AI summary regenerate action。
- read-only Git status tab。
- project-level time range filter and metric strip。

Dashboard time range and Workspace project time range are independent state. Changing the Workspace project range must not unexpectedly change Dashboard charts, and changing Dashboard range must not unexpectedly change selected-project detail views. The current Open Design prototype reuses one `timeRange`, `customStartDate`, and `customEndDate` state for both Dashboard and Workspace; implementation must split this into separate Dashboard range state and Workspace selected-project range state.

Dashboard range updates:

- top metric cards。
- agent token donut。
- token trend。
- agent usage breakdown。
- heatmap scope when supported by available data。

Workspace range updates:

- project metric strip。
- token detail。
- sessions list。
- diary block filtering when date range is active。

The current Open Design prototype only applies Workspace custom range to the project metric strip. Production must extend the same Workspace selected-project range contract to Token Detail rows, Sessions list, and diary block filtering.

Workspace range render order:

1. UI sends the selected `project_id` and Workspace range to Core API.
2. Core validates and canonicalizes `start_date` / `end_date` before issuing any selected-project persisted query.
3. Core queries persisted records using only the canonical selected-project range.
4. Core returns one selected-project range snapshot containing metric strip values, token detail rows, sessions, and diary entry candidates.
5. UI renders metric strip, Token Detail, Sessions, and diary blocks from that same snapshot.
6. UI then applies exact-date and keyword diary filters on the returned diary candidates, or asks Core for the same combined filter contract; either way, date range, exact date, and keyword filters must combine predictably.
7. While the snapshot is loading, stale, or invalid, UI must show loading / stale / validation error state instead of falling back to client mock or local-only filtering in production.

Workspace Auto Diary Summary requirements:

- render the selected project's current summary as Markdown preview by default。
- provide one Markdown-aware editing surface for user override, not separate raw / preview panes。
- support Markdown headings, lists, inline code, and plain paragraphs without injecting raw HTML。
- save user-edited summary through Core API as `DiaryEntry.markdown_user` or project summary override。
- AI regenerate updates AI draft data and must not overwrite existing user override unless the user explicitly accepts it。
- regenerate order: create a new AI draft, persist it as `DiaryEntry.markdown_ai`, keep `DiaryEntry.markdown_user` active for display/export, then require an explicit accept-new-draft action before replacing or clearing user override。
- show diary blocks grouped by month, with one block per date。
- filter diary blocks by exact date and case-insensitive keyword across title and Markdown body。
- when Workspace project date range is active, diary block filtering must combine with the selected date / keyword controls instead of replacing them。

Required sections:

- Kanban。
- Auto Diary Summary。
- Git Status。
- Token Detail。
- Memo Comments。
- Project Docs。
- Sessions。

The current Open Design draft is directionally accepted with the three-column Kanban board: `todo`, `in_progress`, `done`.

Git Status tab is read-only and may display:

- main branch。
- current branch。
- branch relationship。
- working tree state。
- linked worktrees。
- upstream health。
- recent commit graph。
- diff summary lines added / changed / deleted。

The app may surface Git metadata, but must not perform branch cleanup, commit, merge, push, reset, or destructive Git operations in v1.

Git Status data must come from a read-only Core API snapshot such as `GitStatusSnapshot`. The UI may show repository status, commit graph/history, linked worktrees, upstream health, and diff summary, but it must not shell out directly from React or run mutating Git commands.

Cost columns must be hidden in v1 token detail while `cost calculation` remains a Non-Goal.

## 12. Settings and Agents

Agents page must answer: 目前接了哪些 CLI agent？

Required:

- agent cards。
- detected status。
- executable path。
- log path。
- parser status。
- today token。
- last session。
- enabled / disabled。
- remove agent action。
- add agent wizard。
- add agent wizard steps:
  - name and type/model。
  - executable path or command。
  - local connection test。
  - completion and save。
- manual config editor。
- copy setup prompt。
- export debug config。
- open config folder。

Settings must include:

- Project Roots。
- Excluded Paths。
- Agent Adapters。
- AI Diary Agent。
- Data Storage。
- Privacy。
- Appearance。
  - light。
  - dark。
  - follow macOS system。
- Import / Export。
  - Markdown daily diary export action。
- Backup。
- Developer Mode。
- Background scan interval。
- SQLite backup export。

Custom Agent connection tests must be safe and non-mutating:

- accept executable path plus structured argv, not arbitrary shell strings。
- validate path existence / executable permission before running。
- run only fixed safe probes such as version / help / dry-run capability checks。
- run outside project roots and without project cwd。
- do not pass write-capable project credentials or raw secrets。
- enforce timeout and cancellation。
- persist the agent as connected only after a structured successful result。
- expose retry / failed / inconclusive states。
- prove no project files or Git state changed during the test。

## 13. Export

MVP must support Markdown daily diary export.

Markdown export is exposed from Settings -> Import / Export and may also be available from a DailyLog / Workspace diary detail action. The action must call Core API; React UI must not assemble export files directly from client mock state.

Export content:

- date。
- global daily summary。
- per-project summaries。
- completed tasks / fixes。
- token summary。
- sessions summary。
- user comments if included by user。

Minimum Markdown export contract:

```markdown
# DevDiary Daily Export - {date}

## Global Summary
{global_summary_user || global_summary_ai || fallback_report}

## Projects
### {project_name}
{DiaryEntry.markdown_user || DiaryEntry.markdown_ai || per_project_summary || fallback_report}

## Token Summary
- Total tokens: {token_total}
- By agent: {agent token totals}
- Sessions: {session_count}

## Sessions
- {time} {agent_name} {model} {token_total} {status}

## Comments
{included comments, redacted}
```

Content precedence:

1. User override fields win: `DailyLog.global_summary_user` and `DiaryEntry.markdown_user`.
2. AI fields are used when no user override exists: `global_summary_ai`, `markdown_ai`, `per_project_summary`.
3. `fallback_report` is used when AI summary is failed or unavailable.
4. Comments are included only when the user opts in for that export.

Markdown export must omit estimated cost, raw log lines, unredacted `source_log_ref`, raw credential values, and secrets-like comment / document preview content.

MVP may also support app-owned SQLite backup export for local backup / migration. This is separate from Markdown diary export and must not export raw secrets or unredacted credential values.

v1 default SQLite backup/export mode is a redacted structured export bundle, not a raw full database dump.

The export bundle may include:

- schema / app version metadata。
- projects。
- aggregated sessions。
- token usage without cost fields。
- daily logs and diary entries。
- comments。
- document summaries。
- redacted Git status snapshots。

The export bundle must omit or redact:

- raw API keys, tokens, passwords, private keys, and credential file contents。
- unredacted raw log lines。
- unredacted `source_log_ref` targets。
- credentials-like lines from comments and document previews。
- debug config values beyond presence/path/status。

Raw DB export is out of scope for v1 unless explicitly re-approved. If added later, it must be warning-labeled, separately gated, and never be the default action.

## 14. Security and Privacy

The app must preserve secret hygiene:

- Do not print full API keys, tokens, passwords, private keys, or credential files in debug exports.
- Debug export should show presence, paths, parser status, and redacted values only.
- `source_log_ref` must not expose raw sensitive content by default.
- Opening logs should use read-only source view with warning or redaction strategy.
- `Reveal in Finder` is allowed for project folders and app data folders.
- Git Status views must be read-only and must not run mutating Git commands.
- SQLite backup export must redact or omit sensitive raw log lines according to the privacy setting.
- Privacy redaction must run before export artifact creation.
- Export verification must inspect the artifact contents for common secret patterns before reporting success.

## 15. UI Reconciliation Decisions

Resolved conflicts between functional requirement PDF and UI design PDF:

1. Project Detail is integrated into Projects Workspace, not a separate top-level page.
2. Kanban uses 3 v1 workflow statuses: 待處理、進行中、已完成.
3. Dashboard does not routinely show tomorrow recommendations.
4. Heatmap excludes `modified file count` for MVP.
5. `source log link` and `open folder button` must follow read-only and secret hygiene boundaries.
6. UI priority list is interpreted as Workspace section build order, not separate page requirements.
7. Open Design onboarding combines AI Diary Agent and storage location in one final step; this is accepted for v1.
8. Open Design includes Dashboard time range controls, agent token donut, manual scan buttons, theme modes, Git Status, diary search, doc preview, Agent wizard, and SQLite backup export; these are accepted and added to this spec.
9. Open Design currently shows 3 Kanban columns; this is now accepted for v1 and implementation must not expand it to five columns unless explicitly changed.
10. Open Design includes an AI summary `下一步` item. This is accepted only as optional summary content or follow-up extracted from actual logs, not as a routine tomorrow recommendation panel.
11. Open Design shows estimated cost in a token table. This conflicts with the v1 Non-Goal `cost calculation`; v1 must hide cost fields and may revisit estimated cost in a future version.
12. Open Design uses prototype copy such as `儲存至 SQLite` and `Agent 將自動寫入 SQLite DB`. Product copy must instead say the action is saved through DevDiary Core / Core API.
13. Open Design uses daemon / 守護進程 wording. v1 must describe this as in-app scheduler or Core sidecar while the app is running, because LaunchAgent background runner is a Non-Goal.
14. Open Design `.db` / full SQLite export copy is prototype-only. v1 product copy and actions must use redacted structured export bundle wording.
15. Open Design `handleRunScan` appending a completed Kanban card is mock/demo behavior only. Implementation must use stable source identities plus upsert/idempotent persistence.
16. Open Design Agent wizard timer-based success and ping copy are placeholder-only. Implementation must replace them with Core-managed safe non-mutating probe states before saving connected status.
17. Open Design Dashboard currently derives custom range totals proportionally from all-time mock constants. This is prototype-only; production must aggregate persisted range data.
18. Open Design Dashboard heatmap currently uses random intensity and random click details. This is prototype-only; production heatmap must be deterministic and data-backed.
19. Open Design currently shares one time-range state between Dashboard and Workspace. This is prototype-only; production must split Dashboard and Workspace range state.
20. Open Design Workspace custom range currently updates only the metric strip. This is prototype-only; production must apply the accepted project range to Token Detail, Sessions, and diary block filtering.
21. Open Design `handleAiRegenerate` overwrites editable/project log text directly. This is prototype-only; production must preserve user override and require an explicit accept-new-draft action.

## 16. Acceptance Criteria

- [x] 使用者可完成 onboarding，並設定至少一個 project root。
- [x] App 可偵測 Claude Code / Codex CLI / Antigravity CLI executable 與 log path 狀態。
- [x] App 可掃描 root folder 並建立 project list。
- [x] Core Engine 可從至少 Claude Code 與 Codex CLI logs 建立 sessions。
- [x] Antigravity parser 若未完整支援，必須清楚標示 experimental。
- [x] SQLite 中可查到 projects、sessions、token usage、daily logs。
- [x] Dashboard 可顯示今日 token、active projects、sessions、agent usage、heatmap。
- [x] Dashboard 可依 24h / 7d / 1m / custom / all-time 切換主要指標與圖表。
- [x] Dashboard 有明確可點選的 all-time / cumulative selector。
- [x] Dashboard custom date range uses persisted data aggregation, not proportional mock constants.
- [x] Dashboard donut chart, agent breakdown, metric cards, token trend, and heatmap all use the same selected Dashboard range contract.
- [x] Dashboard heatmap is deterministic and data-backed by session count, total tokens, transcript length, and AI detected task count.
- [x] Dashboard token trend supports total plus Claude Code, Codex CLI, Antigravity CLI, and other buckets through `DashboardTrendSeries`.
- [x] Dashboard renders selected-range metrics only after Core returns a validated aggregate snapshot with canonical range dates and `captured_at`.
- [x] Dashboard selected-range snapshot drives metric cards, donut center/legend, agent breakdown, token trend, and deterministic heatmap consistently, including empty range, custom range, and reversed-date correction states.
- [x] Dashboard 可手動觸發 read-only scan，並顯示掃描中、成功、失敗狀態。
- [x] Manual scan / rescan respects root whitelist、excluded paths、ignored、scan_paused、privacy setting and is idempotent.
- [x] Projects Workspace 可切換 project，查看 Kanban、摘要、Token、Docs、Sessions、Comments。
- [x] Dashboard range and Workspace project range are independent and update only their intended views.
- [x] Workspace selected-project range snapshot filters metric strip, Token Detail rows, Sessions list, and diary blocks together.
- [x] Workspace selected-project range combines predictably with diary exact-date and keyword filters.
- [x] Projects Workspace 可查看 read-only Git Status，不執行任何 mutating Git command。
- [x] Projects Workspace 可用日期與關鍵字搜尋 diary blocks。
- [x] Projects Workspace Auto Diary Summary supports Markdown preview/editing, month-grouped diary blocks, exact-date filtering, and keyword search.
- [x] Projects Workspace 可預覽 document summary 全文。
- [x] Comments 可新增、標籤分類、置頂、刪除、篩選。
- [x] Kanban status change 只寫入 app data，不改 project files。
- [x] Kanban implementation 使用 3 個 v1 statuses: `todo`, `in_progress`, `done`.
- [x] `Project.tracking_status` and `KanbanCard.status` are separate and not reused for each other.
- [x] 每日 summary 可由 app scheduler 產生。
- [x] AI summary 失敗時顯示 deterministic fallback report。
- [x] 使用者可手動編輯 AI summary，並以 Markdown preview 顯示。
- [x] 使用者可手動要求 AI regenerate project summary without overwriting user override unless explicitly accepted.
- [x] CLI Agents 可啟用/停用、移除、新增 custom agent 並完成本機連線測試。
- [x] Custom Agent connection test uses safe non-mutating probes, has timeout/failure states, and cannot save connected state when inconclusive.
- [x] Settings 可設定 project roots、excluded paths、scan interval、default diary agent、privacy、appearance。
- [x] Appearance 支援 light / dark / follow macOS system。
- [x] AI Diary Agent 只能讀 structured data package。
- [x] App 不會修改任何 project folder 內檔案。
- [x] Debug export 不洩漏完整 secrets。
- [x] 可 export Markdown daily diary。
- [x] Markdown daily diary export is available from Settings -> Import / Export or diary detail, uses Core API, respects user override precedence, can optionally include comments, omits cost fields, and redacts sensitive references.
- [x] Token Detail omits estimated cost while cost calculation remains a Non-Goal.
- [x] 可 export / backup app-owned SQLite data as a redacted structured export bundle without leaking secrets。
- [x] Product copy does not imply React UI or agents directly write SQLite.
- [x] v1 scan copy uses in-app scheduler / Core sidecar wording, not LaunchAgent / daemon / persistent background runner wording.
- [x] 可 build 出 unsigned `.app` / `.dmg`。


## 17. Verification Plan

Before implementation completion:

- Run unit tests for parser and token aggregation.
- Run Core API tests for project/session/token/daily log endpoints.
- Run SQLite migration / schema tests.
- Run read-only safety tests proving project folders are not modified.
- Run AI summary fallback tests.
- Run UI smoke test for onboarding, dashboard, projects workspace, agents, settings.
- Run UI smoke test for Dashboard time range, manual scan, diary search, markdown summary edit, doc preview, comment filters, Agent wizard, theme switching, and SQLite backup export.
- Run Dashboard custom date aggregation tests against seeded persisted records, including empty range, one-day range, and reversed start/end correction.
- Run Dashboard data consistency tests proving metric cards, donut, breakdown, token trend, and heatmap read the same selected range.
- Run Dashboard trend series tests proving total, Claude Code, Codex CLI, Antigravity CLI, and other buckets render from the same Core range snapshot.
- Run Dashboard selected-range snapshot tests covering metric cards, donut center/legend, agent breakdown, trend buckets, deterministic heatmap, empty range, custom range, and reversed-date canonicalization.
- Run heatmap determinism tests proving the same persisted records produce the same cell intensity and click detail.
- Run repeated global scan and selected-project rescan tests proving no duplicate sessions, diary blocks, or Kanban cards; scoped rescan does not update unrelated projects; Dashboard metrics, last scan time, and project metrics update only after Core persistence succeeds.
- Run Dashboard / Workspace time range independence smoke: Dashboard range changes only Dashboard cards, donut, trend, breakdown, and heatmap; Workspace range changes only project metric strip, token detail, sessions, and diary filtering.
- Run Workspace selected-project range tests proving the same Core snapshot drives metric strip, Token Detail rows, Sessions list, and diary block candidates, then combines with exact-date and keyword filters.
- Run read-only Git status tests proving Git views do not mutate repositories.
- Run Agent wizard safety tests proving failed/inconclusive probes cannot save connected state and no project files / Git state changed.
- Run export redaction tests against representative secret-like fixtures and inspect generated artifact contents.
- Run Markdown daily diary export tests for template shape, user override priority, AI fallback, optional comments, no cost fields, and redaction of sensitive references.
- Run UI smoke assertion that Token Detail shows no estimated cost column while cost calculation is out of scope.
- Run desktop and mobile-width visual checks for web-rendered UI where applicable.
- Build unsigned `.app` / `.dmg`.
- Perform manual smoke with developer test roots:
  - `~/Projects`
  - `~/Workspace/side-projects`

## 18. Resolved / Deferred Questions

- Open Design UI code format is resolved as React + Tauri shell in this repo.
- Claude Code / Codex CLI / Antigravity CLI log schemas and local paths were implemented through Core parser/detection tests and runtime smoke; Antigravity token totals remain low-confidence/experimental when metadata lacks stable token fields.
- Local HTTP API port discovery is implemented through runtime identity, manifest discovery, stale detection, and dynamic dev port fallback.
- App scheduler handles Core-process sleep-like gaps through recovery ticks; fully closed app OS-level catch-up remains deferred hardening because LaunchAgent / daemon behavior is a v1 Non-Goal.
- Markdown export template is implemented through Core daily export with user override precedence, optional comments, no cost fields, and sensitive-reference redaction.
- Estimated cost calculation remains deferred; v1 hides cost UI.
- Raw SQLite export remains deferred; v1 provides redacted structured backup.
- The project folder is already a Git repo on `feature/core-engine`; no new `git init` action is needed.
