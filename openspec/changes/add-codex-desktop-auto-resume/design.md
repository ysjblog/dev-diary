---
openspec_level: o3
template_version: owner-workflow/v1
change: add-codex-desktop-auto-resume
reasons: external_write,workflow_state,data_migration
---
# Technical Design: Codex Desktop 多任務額度恢復續跑

## 中文摘要

使用者以 deep link 註冊任務，Core 保存 UUID digest、顯示名稱與經驗證的 session locator/checkpoint。背景 runner 只讀註冊後新增的完整 JSONL 行，只接受 Codex 結構化額度事件。恢復時間到後，以全域 lease 鎖住一次動作，使用 exact UUID 呼叫 Codex CLI queue，收到綁定 UUID 的 durable queue receipt 且正常退出才完成送出；此結果不宣稱 turn 已開始。

## Context

舊方案依賴 Codex Desktop Accessibility tree、前景視窗與剪貼簿，但目前 App 不穩定暴露可驗證的 composer tree。2026-09-19 真實測試證明 exec resume 在 Desktop 持有 session 時因 active writer 拒絕；同一目標使用公開的 codex queue 命令成功排入，Desktop 隨後啟動新 turn。改用非 GUI 的 durable queue transport。

## Goals / Non-Goals

目標是多任務、額度事件專用、精確 UUID、失敗關閉且不重播不明結果。非目標是任意 prompt、自動完成保證、繞過額度、GUI 點擊或對抗同帳號惡意程式。

## Runtime Path and Data Flow

1. UI 取得 verified Core health snapshot，提交 deep link 與名稱。
2. Core 解析 UUID、完整掃描 configured roots、保存唯一 session checkpoint。
3. background runner 逐 target 重新驗證來源並解析註冊後 quota evidence。
4. reset time 到後在 SQLite transaction 取得 global lease 與 target claim。
5. dispatcher 以 fixed argv 呼叫 Codex CLI；queue receipt 與 exit 0 後保存完成 evidence，否則 fail closed。

## Decisions

- 選擇 CLI UUID queue，因為 identity 是精確且不依賴視窗狀態。
- 拒絕 Accessibility/座標/剪貼簿注入，因為 UI tree 與焦點無法形成穩定安全契約。
- 任務名稱僅為 label，避免改名或同名造成誤定位。
- 不明 dispatch 結果消耗 evidence 並要求人工確認，避免重複傳送。

## Contract Inventory

| Contract | Producer | Consumer | Boundary |
|---|---|---|---|
| canonical deep link / UUID | Settings UI | Core registration | exact grammar |
| session locator/checkpoint | session lookup | resume engine | unique, no-follow, digest |
| quota evidence | Codex JSONL | strict parser | exact enum/message/time |
| target claim/lease | SQLite repository | runner | one action globally |
| fixed queue argv / durable receipt | runner | bundled Codex CLI | no shell, bounded output |
| verified runtime snapshot | Core health/manifest | every mutation | fresh exact parity |

## Execution Order and Failure Recovery

所有 source proof 在 claim 前完成；claim 在 dispatch 前持久化；dispatch 結果在清 lease 前持久化。若 runner 在 claim 後死亡，expired lease recovery 轉 `needs_attention` 並消耗 evidence。註冊、pause、rename、delete 在 active lease 時不寫入。migration 先排除 live/unknown legacy owner，再以單一 transaction 建立 v8 state。

## Identity and Registration

- deep link 必須精確為 `codex://threads/<lowercase UUID>`，不得含 query、fragment、credential 或額外 path。
- `thread_id` 是唯一定位鍵；`display_name` 經 NFC/長度/control-character 驗證，只供 UI 顯示與 metadata 輔助，不會進入 CLI argv。
- lookup 對 configured roots 做有界 no-follow metadata-prefix 掃描。單一 match 可直接註冊；同一 root、同一 active 或 archived store 內若多個 match 都有不同且可解析的 session start timestamp，視為 Codex 對同一 UUID 產生的連續 segments 並只選最新者。跨 root、active/archive 並存、重複 timestamp 或缺少 timestamp 的多 match 均拒絕。
- target 保存 safe `rN/relative` locator、dev/ino、註冊 EOF offset、prefix digest、timezone ID 與 Node/ICU/TZ authority。動作前再次做跨 root 唯一性、identity 與 prefix proof；除下述經完整驗證的 sequential segment transfer 外，任何 drift 轉 `needs_attention`。

## Quota Evidence

只接受完整 JSON 行：外層 `type=event_msg`、`payload.type=task_complete`、`payload.error.codex_error_info=usage_limit_exceeded`，message 只接受官方固定前綴 `You've hit your usage limit.` 或 `You’ve hit your usage limit.`（U+0027/U+2019），保留原始行 digest，不作寬鬆 Unicode 正規化，並包含唯一 `or try again at` clause。解析器接受帶日期的 ordinal English 時間或當日時間，驗證 timezone 與七日上限。註冊前內容、未完成尾行、普通文字、重複或已完成 evidence 均不可觸發。

## Dispatch

背景 session 唯一性搜尋使用 `CODEX_DESKTOP_BACKGROUND_LOOKUP_DEADLINE_MS=30_000` 的 deadline，前景註冊維持 5 秒。可選 deadline 必須是 1–30,000 毫秒的 safe integer，不能無上限延長。同步 I/O 無法中途打斷；每個 visit、掃描結束與完整讀取／解析／hash／時區驗證完成後重新檢查期限，控制權返回後拒絕逾期結果、不建立 claim。較長的背景搜尋不改變 metadata、duplicate、檔案 identity、prefix digest 或既有安全恢復條件，且不增加 dispatch 權限。

Dispatcher 優先使用 `/Applications/ChatGPT.app` 內附且已驗證的 regular Codex executable，設定的 standalone CLI 僅作備援。使用 `shell:false`、cwd `/`、安全 allowlisted environment 與固定 argv：`queue`, `--thread`, `<thread UUID>`, `--message`, `繼續`。Engine 從已驗證 locator 的 rN 選擇 canonical data root，透過 dispatcher context 的 `codexHome` 傳遞，child `CODEX_HOME` 必須使用該 root，不能默默寫入其他 store。Callback 的 UUID 與 root 必須來自同一筆已驗證目標。禁止 raw app-server、私人 socket、GUI injection、另開 exec resume fallback 或竄改 Codex queue DB。

Queue acknowledgement 契約：15 秒內 child 必須正常退出 code 0、沒有 signal，stdout 精確為單一完整行 `Queued message <canonical UUID> for thread <exact registered UUID>.` 加換行（接受 CRLF）。message UUID 與 thread UUID 均需 canonical lowercase RFC 9562 v1-v8/variant 驗證。錯 UUID、多行／額外 stdout、舊 turn.started JSON、缺換行、非零 exit 即使有 receipt 都不得成功。這是「已送出續跑要求」而非執行開始證明；保留 v8 internal terminal state `resumed` 以相容既有資料，不變更 schema/API shape，但 UI 明確顯示「已送出續跑要求」並說明已排入佇列、未保證工作完成。歷史 resumed row 同樣僅表示請求被接受。

stdout 上限 256 KiB、stderr 上限 16 KiB，兩者一律只暫存記憶體。失敗僅保存 allowlisted diagnostic enum：active writer、queue unsupported、session not found、auth required、command failed、receipt invalid；不保存或輸出 raw stderr、UUID、路徑、token 或 transcript。Timeout/overflow 先終止 detached process group，確認 direct child close 且 process.kill(-child.pid, 0) 僅回 ESRCH（整個群組不存在）後才釋放 lease；無法確認停止則 quarantine。即使 receipt 已印出但 timeout/非零 exit，持久 queue 可能已接受，因此仍消耗 evidence、要求人工處理，絕不自動重送。收到 receipt 且成功退出同樣消耗 evidence，第二 tick 不再排入同一事件。

Direct-child close alone MUST NOT establish process-group termination; an unproven live descendant keeps the lease quarantined. TERM 後在 terminationGraceMs 內短輪詢 child close 與 group absence；未消失就 KILL，再有界等待；EPERM／未知probe錯誤視為未證明。正常 exit/receipt 也不得留下未確認的 live group；若仍有後代，進入相同有界終止程序。只有 parent 已在原期限內正常 exit0、完整精確 receipt 且後續 cleanup 確認整個群組不存在時，才能記錄已送出；cleanup 未證明停止仍 quarantine，不宣稱成功。不得透過殺死Desktop或其他既有程序解除writer lock。

本次已失敗 target 的舊 evidence 維持 consumed。手動診斷 queue 已產生真實新 turn；升級不可重播這筆事件。Generic monitoring recovery allowlist 僅含 `codex_resume_active_writer`, `codex_resume_queue_unsupported`, `codex_resume_session_not_found`, `codex_resume_auth_required`。只在明確的 enabled false→true、原state needs_attention、completed_evidence_id 與 action_high_watermark 均存在、current_evidence_id/current_evidence_cursor/attempt_token/action_phase 均NULL、lock_quarantine_required=0且global clean idle時清除error/恢復watching；其他欄位尤其consumed evidence/cursor不得改動。下一tick照常驗證來源。command_failed、receipt_invalid、ack_timeout、output_too_large、previous_dispatch_outcome_unknown與所有*_process_unterminated均排除。
Legacy codex_resume_not_acknowledged is outcome-unknown and MUST NOT enter the generic monitoring-recovery allowlist.
本次特定舊目標需另做一次Owner人工修復：以exact target、原failure updated_at、已消耗evidence/cursor、global clean idle、同檔案identity/prefix及已觀察的Desktop新turn證據做compare-and-set；只有預期全部吻合才清除監看error，不回寫或重播已消耗事件。這不是產品通用恢復規則；無法驗證任一前提即保持停止。

## Concurrency and Recovery

- singleton state 提供 global enable/revision 與單一 active target lease；每個 tick 最多 dispatch 一個 target。
- claim transaction 同時保存 evidence、cursor、attempt token 與 deadline；recovery/finalization 以 target、lease token、generation 與 deadline fencing，且只有條件更新各命中一列才可完成或清除 lease。
- runner 在 claim 後崩潰且 lease 過期時，原子消耗 evidence、target 轉 `needs_attention`、設 `lock_quarantine_required=1` 並保留原 lease identity，將期限設為 `Number.MAX_SAFE_INTEGER`。同 tick 與後續／重啟 ticks 均不得派送任何 target；不能因 global pause、啟用切換、刪除 target 或單純時間經過解除。
- Runner restart or lease expiry MUST NOT release an unknown dispatch lease without process termination proof; otherwise the global lease remains quarantined.
- 目前 schema 不保存可跨重啟驗證的 process-group 身分，因此產品不提供自動解除 quarantine；恢復必須另行人工診斷並取得該派送群組已不存在的可信證據，不能猜測 PID、以一次新 queue 成功或單憑 runner 不在就放行。無證據時保持停止，UI 回報需人工處理。正常 dispatcher 的有界終止檢查只對本次持有的 child/group 有效，不可用於舊 lease。
- action 進行中拒絕使用者 mutation；global pause 保留 targets，單一 pause/rename/delete 只修改指定 UUID。

## API and Runtime Binding

- `GET /api/codex/desktop-resume`
- `PATCH /api/codex/desktop-resume` exact `{enabled}`
- `POST /api/codex/desktop-resume/targets` exact `{deep_link,display_name}`
- `PATCH /api/codex/desktop-resume/targets/:threadId` 只接受 `display_name`/`enabled`
- `DELETE /api/codex/desktop-resume/targets/:threadId`

成功回 `{ok:true,codex_desktop_resume}`。一般 settings 拒絕 resume 欄位；舊 `/register`、`/stop` 回 410。每個 mutation 必須帶 verified health snapshot；transport 與 Core pre-parser 都重新比對 manifest digest、PID、origin、contract/capabilities，target drift 時 zero mutation。可信 loopback route 可回 thread ID 作 UI key，但畫面、錯誤、log 不顯示完整 UUID。

## Migration and Rollback

schema v8 新增 singleton `codex_desktop_resume_state` 與 `codex_desktop_resume_targets`，以 CHECK/UNIQUE 約束 identity/state/token/time。Core 在 open DB 前拒絕 live/unknown manifest owner。LaunchAgent 只在 Core spawn 成功後安裝，且背景 runner 在 open DB 前拒絕 malformed/incompatible live owner，只允許已由 Core 建立 current schema 與 migration marker 的資料庫；背景路徑不建立或升級 schema。舊 shared settings resume shape 在 startup transaction 中轉成 global disabled、empty targets 與 `legacy_reregistration_required`，不延續 waiting/resuming claim。

Rollback 可停用 global switch 或逐一註銷 target；這兩者不刪 Codex session。若回退至 contract v7，v8 專用資料保留但舊 UI 不可寫入，重新升級後仍需由 v8 migration/validation 接管。

## Security and Privacy

Source 是 deep link、display name、本機 JSONL 與 verified runtime header；sink 是 SQLite 與 fixed CLI spawn。防護包括精確 schema、UUID/parser、no-follow/identity/digest、bounded reads、固定 argv、no shell、安全 env、單一 lease、queue receipt timeout 與 redacted errors。不讀 credential、不輸出 raw transcript、不把名稱或 quota message 放入 command。同帳號惡意程序可改本機檔案或假冒 executable 是殘餘風險；未知狀態 fail closed。

## UI and User Flow

設定頁輸入 deep link 與目前任務名稱。清單支援暫停、繼續監看、重新命名、註銷，顯示等待恢復時間、已送出續跑要求或需人工檢查。UI 只在 Core v8、required capability 與 verified runtime snapshot 成立時啟用 mutation。dispatch 不注入 UI 輸入；queue 確認後透過固定 bundle id 的 deep link 開啟任務並切換前景。

## Verification

測試涵蓋 malformed link/name、跨 root duplicate、prefix drift、真正/偽造 quota、未到期、multi-target serialization、crash no replay、exact argv/ack、API/CORS/runtime drift、migration，以及 LaunchAgent-before-Core 的舊/缺少 schema 零資料庫變更。Runtime smoke 使用 temp DB、fixture roots 與 fake CLI receipt，自動測試禁止真實 Codex target；受控人工 runtime 只可使用本次使用者授權的已註冊目標，優先既有 queued item。desktop-only UI 需 localhost screenshot 與黑箱互動。

## Risks / Trade-offs

CLI 比 GUI 精準，但依賴 bundled CLI 的 queue 與精確收據 contract；漂移時功能會停止而非降級成按鍵操作。完整跨 root 掃描與 prefix hash 比只看檔名較慢，但只在註冊與 actionable evidence 前執行，換取錯任務風險降低。

## Open Questions

None.

唯一有效派送命令為 codex queue --thread <UUID> --message 繼續；成功只表示續跑要求已被接受。

## Recovery timing and sequential segment repair (2026-09-21)

Recovery repair proposal (2026-09-21)
1. Exact quota parser keeps evidence raw digest and reset wall clock. Recognize a recent past reset within 60 minutes (dated or time-only, including yesterday across midnight) instead of interpreting it as tomorrow. For time-only, otherwise retain existing next future day behavior. Only strict structured vendor events qualify.
2. Engine waits reset+60 seconds for future-reset events. For an error whose reset<=event time, wait event+5 minutes. Persist optional paired quota_retry_reset_at_ms and quota_retry_count (safe integer 0..3) in action_high_watermark JSON. On any recent-past error dispatch increment the persisted retry count regardless of reset value (missing legacy pair starts at one). A future-reset dispatch may start count zero only when its reset is strictly later than the stored reset; otherwise preserve the count. Persist the maximum reset observed, never move the cycle backward. Carry this budget unchanged across segment transfers and restarts. Missing legacy pair means zero; partial/malformed pair fails closed. Allow at most three delayed retry requests across all recent-past reset values in a cycle; fourth becomes needs_attention/quota_retry_exhausted. A new future reset starts a separate cycle. No new message unless a fresh exact error exists. Unknown dispatch remains quarantined; never retry an acknowledged request merely because no turn appeared.
3. Latest sequential same-thread segment can replace an old registered segment only before a claim, same root and sessions/archived area, strictly later canonical session_meta timestamp than old segment and registration time, exact UUID, stable nofollow regular files; old registration and consumed prefix hashes must still validate. New segment metadata must be first complete line and exact UUID. Verify fresh lookup full prefix and inode before deriving new checkpoint at end of metadata. Ignore copied quota with timestamp earlier than new metadata. Transaction rechecks global clean idle, enabled target, unchanged old checkpoint and safe states; preserves registered_at, completed_evidence_id and all unknown-dispatch quarantine. Transfer action_high_watermark to the new metadata prefix while carrying the retry budget and event_floor_at_ms; no source movement or deletion. This acknowledges a newer Codex runtime generation supersedes unclaimed evidence in the old segment. Source prefix drift and same-locator inode changes remain fail-closed.
4. CLI queue itself has no wake flag. The 2026-09-22 amendment adds foreground-assisted LaunchServices navigation; no private appserver or GUI injection. Protected user WIP unchanged.


### Consolidated review fixes R1-R3

R1: The retry budget belongs to the registered logical thread recovery cycle, not to one segment or alternating stale reset values. Persist it in the existing watermark JSON and preserve it across every checkpoint transfer.
R2: Derive a consumed event time floor from all complete strict quota events through the old consumed byte boundary, and combine it with any persisted event_floor_at_ms. A new segment start MUST be strictly greater than registration time, old metadata time AND that consumed floor; otherwise transfer fails closed. The new checkpoint carries event_floor_at_ms=max(new metadata time, previous consumed floor). Candidates with event timestamp <= the floor are excluded. Every claim cursor carries max(previous floor, all candidate timestamps through the claimed byte offset) so non-last consumed evidence cannot replay. Legacy watermark missing the floor is reconstructed from its hash-verified consumed prefix. Old prefix and consumed prefix validation precede transfer. Equal timestamps fail closed.
R3: The final claim transaction, not just transfer, MUST verify every global lease field is null, global enabled, target enabled, state in watching/waiting_for_reset/resumed, lock_quarantine_required=0, no current claim fields, exact unchanged registration identity/prefix/offset/registered_at and updated_at, exact completed_evidence_id/action_high_watermark and timezone authority. A conditional target update must change exactly one row before creating the lease in the same transaction; otherwise return skipped without dispatch. Transfer uses the same snapshot fence, additionally allowing only needs_attention/session_uniqueness_unproven with no quarantine/claim. Second-connection pause/delete-re-register/checkpoint mutation after scan must prevent dispatch.

### Final closer root-cause resolution RC1
A single reset/count pair cannot retain multiple alternating reset budgets. Therefore all recent-past errors share the cumulative count; only a strictly later future reset opens a new cycle. A,A,A,B,A cannot gain a fourth retry. This is a stricter bounded policy, not an unbounded reset-key ledger.

## Foreground-assisted wake (2026-09-22)

NEW `core/src/services/codexDesktopWake.ts` exports `createCodexDesktopWakeDispatcher`, wrapping the existing queue dispatcher; `backgroundRunner.ts` is its production consumer. Before queue, canonical context.codexHome must equal realpath of the local user's `.codex` Desktop store; an alternate store fails with `codex_resume_desktop_store_mismatch` and zero external writes. No fallback store. A queue result is eligible only when accepted=true, code=queued and releaseLease is not false. Then invoke `/usr/bin/open` with shell:false, cwd `/`, safe environment, fixed argv `-b`, `com.openai.codex`, `codex://threads/<canonical UUID>`. Never use -g, -j, -W, window coordinates, clipboard, composer injection, private IPC or a second queue call. The foreground switch is intentional and approved.

The opener has a 5-second deadline, detached process group, ignored output, SIGTERM then SIGKILL with two 2-second grace periods, child-close plus ESRCH group-absence proof. Only normal exit zero before deadline plus termination proof counts as `queued` accepted; this remains request/navigation acceptance, not task start. Opener errors are `codex_resume_queued_wake_failed`, timeout `codex_resume_queued_wake_timeout`; append `_process_unterminated` and releaseLease=false when termination is unproven. No raw command diagnostics persist. Engine consumes the claim for all post-claim results and failure becomes needs_attention; no new recovery allowlist, no auto-reopen or resend on later ticks/restart. A crash between queue and open retains existing unknown-outcome quarantine.

Increase the claim/action lease from 30 to 45 seconds to cover queue 15s + cleanup 4s + open 5s + cleanup 4s with margin. Keep startup deadline 15s. Schema, API state enum and completed-evidence semantics are unchanged. Legacy resumed rows are not reopened on upgrade. Existing pause/mutation exclusion remains for the complete queue+open action.

Safety/runtime limits: macOS must be awake with a usable logged-in graphical session and Codex credentials valid. No OS sleep prevention, unlocking, automatic approval, quota bypass or task-completion guarantee. Standalone CLI stores other than the local Desktop store are intentionally rejected for this foreground transport. Runtime verification must distinguish macOS open acceptance from an actual new turn and check exactly one queued input; a preloaded-task-only probe cannot prove cold activation. Missing controlled dormant-target evidence blocks a claim of proven unattended cold wake.
