---
openspec_level: o3
template_version: owner-workflow/v1
change: add-codex-desktop-auto-resume
reasons: external_write,workflow_state,data_migration
---
# Change Proposal: Codex Desktop 多任務額度恢復續跑

## 中文摘要

DevDiary 允許使用者貼上 `codex://threads/<UUID>` 與目前任務名稱，註冊多個 Codex Desktop 任務。名稱只供顯示；系統以 UUID 和本機 session metadata 精準定位。只有註冊後出現結構化 `usage_limit_exceeded`、合法恢復時間已到且來源仍唯一完整時，背景程序才以本機 Codex CLI 的 `queue --thread <UUID> --message 繼續` 排入固定訊息；正常退出且精確回條吻合才記為要求已接受。

## Why

Codex Desktop 目前不會替因額度用完中斷的多個任務在恢復後自動接續。座標或 Accessibility 操作會受版面、焦點、語系與剪貼簿影響；本機官方 CLI 提供 `codex queue`，以不可變 UUID 將訊息交回 Desktop。背景程序使用 codex queue 排入固定續跑要求；exec resume 已因 Desktop active writer 衝突而排除。

## What Changes

- 新增 contract v8 專用 SQLite state/targets、註冊、暫停、重新命名、註銷與背景狀態。
- deep link 註冊只接受 canonical UUID；同一 canonical store 內由 Codex 產生、開始時間可解析且互異的連續 session segments 視為同一 logical thread，並選出唯一最新 segment；跨 root／活動與封存並存或開始時間歧義仍拒絕。
- 嚴格解析真正的 Codex JSONL 額度事件；普通錯誤文字、舊事件、未到恢復時間皆不動作。
- 恢復時優先使用 Codex Desktop 內附 CLI，以 `shell:false` 固定 argv 執行 `codex queue --thread <UUID> --message 繼續`；只有正常退出 code 0 且收到唯一完整、精確匹配的 queue receipt 才記為「已送出續跑要求」。
- 設定頁可管理多個任務；不需要固定視窗大小、位置或 Accessibility 權限；queue 確認後會自動切換到註冊任務。

## Scope

Core schema/repository/session lookup/quota parser/background engine/API、React 設定頁、runtime mutation binding、測試與操作文件。

## Non-Goals

- 不接受自訂 prompt；固定只送「繼續」。
- 不取得或保存 Codex credential，不繞過 OpenAI 額度限制。
- 不保證 CLI 已開始的後續任務一定完成，也不代替 Codex Desktop 顯示進度。
- 不以任務名稱、視窗標題、座標或目前焦點作定位依據。

## Capabilities

### New Capabilities

- `add-codex-desktop-auto-resume`: 多任務、精準 UUID、額度事件驅動的本機自動接續。

### Modified Capabilities

- `dev-diary-macos-app`: Core contract 提升至 v8，設定 mutation 綁定已驗證 runtime，resume state 移至專用資料表。

## Impact

- 命令會對使用者已註冊的 Codex 任務送出固定訊息，因此只有精確額度證據、到期時間、session 唯一性與全域 lease 全部成立才執行。
- CLI 或 JSON event contract 漂移時會進入 `needs_attention`，不猜測成功、不自動重播不明結果。
- 同一 macOS 使用者仍可修改本機 JSONL 或替換 CLI；透過檔案 identity/prefix digest、固定 argv、regular executable 與安全環境縮小風險，但不宣稱防禦同帳號惡意程式。
- 舊單任務設定不自動續跑；migration 轉成 disabled/empty，要求重新用 deep link 註冊。

## Risks

- Codex CLI 或 session JSONL 格式未來可能改變；精確 parser 與 acknowledgement 會讓未知格式停止並要求人工處理。
- 本機同帳號程序可修改 logs 或 executable；這是明示的 local-user trust residual。

## Completion Evidence

Strict OpenSpec、fresh Author Preflight、O3 security/integration/failure review、Core/UI/Rust 完整測試、typecheck/build/diff/security scan、假 CLI runtime smoke、desktop screenshot 與獨立黑箱驗證。自動測試只用隔離 fixture；使用者已授權無人操作續跑及前景切換，受控真實驗證只可針對已註冊目標，優先消費既有 queued item，不得重播已消耗 evidence。

## Open Questions

None.

唯一有效派送命令為 codex queue --thread <UUID> --message 繼續；成功只表示續跑要求已被接受。

## Recovery repair amendment

Add bounded delayed retries for recent-past vendor reset timestamps and safely follow verified newer segments of the same registered thread. Queue acceptance still does not guarantee a dormant Desktop task starts. No transport expansion.

## Foreground-assisted wake amendment (2026-09-22)
The user explicitly accepts automatic foreground navigation for unattended continuation. After an exact queue receipt and proven queue process-group termination, open only that UUID's deep link using macOS LaunchServices bound to com.openai.codex. Keep the existing accepted-request UI semantics; a successful open is not turn-start proof. Verify actual task start separately in controlled runtime evidence. No task-completion guarantee is added in this bounded amendment. A later diagnostics-only observer (see the "Resume diagnostics observe without changing dispatch outcome" requirement) records bounded local start evidence but never changes dispatch, retry or target state.
