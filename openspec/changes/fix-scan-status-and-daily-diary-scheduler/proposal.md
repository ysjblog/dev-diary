# Change Proposal: Fix scan status and schedule Daily diary generation

## 中文摘要

目前 Footer 的「掃描中」直接相信持久化的 `running_operations`；程序已結束卻未留下 finish 記錄時，舊項目會永久讓圖示旋轉。本變更讓 Core 以可復原的 operation ownership 判定真正進行中的掃描，並讓每日排程同時產生 Project summary、每個專案的 Daily diary 與 Daily highlight，且不覆寫使用者已確認的日記。

## Why

The scan-status UI can remain busy after a completed or interrupted operation leaves a persisted entry behind. The daily scheduler already produces project-level drafts and a global highlight, but does not invoke the date-scoped Daily diary writer or its prompt setting.

## What Changes

- Modify scan operation state so Core records ownership and completion safely, reconciles orphaned operations, and exposes a reconciled active set for UI busy status.
- Modify daily scheduler execution so one eligible ordinary daily run produces Project summary, unconfirmed Daily diary entries, and Daily highlight using one `Asia/Taipei` scheduler date shared by its default readers.
- Add explicit idempotency, ordering, finalization-failure, export/backup-reader, and manual-confirmation preservation rules for concurrent scans and daily reruns.

## Scope

- Core scan-operation persistence, scan routes/background runner, settings snapshot, and the Footer's Core-backed busy indicator.
- Daily scheduler, date-scoped project-diary write path, prompt selection, daily-log and scheduler-run finalization, default date readers, exports/backup, and their Core/API tests.

## Non-Goals

- No direct project-folder write, Git mutation, cloud synchronization, external scheduler, or new authentication contract.
- No retroactive generation of historical dates and no overwrite of user-confirmed daily diary content.

## Resolved Scope Decision

The user selected `remove-mobile-rwd-layout` as the sole owner of desktop-only presentation behavior. This Change owns no app-shell presentation behavior.

Verification boundary: mobile viewport and responsive-layout validation are explicitly not applicable. The supported product surface is the existing desktop workspace at 768 CSS pixels and wider; this Change requires desktop runtime and desktop black-box evidence only.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `dev-diary-macos-app`: scan lifecycle truth and daily scheduler outputs change within the existing desktop/Core capability.

## Impact

- **Core:** `settings.ts`, `server.ts`, `backgroundRunner.ts`, `dailyScheduler.ts`, and `projectWrites.ts` require coordinated changes.
- **UI:** `src/App.jsx` consumes the reconciled Core scan-state contract instead of inferring activity from stale persisted entries.
- **Data/API:** app-owned settings gains operation ownership/recovery metadata; scheduler results gain compatible output-specific counters/statuses.
- **Tests:** settings/scan-route/background-runner/scheduler/project-write tests need contract coverage; runtime/UI evidence is a later gate.

## Risks

- Too-aggressive recovery could hide a real long scan; owner/liveness and bounded-deadline design must retain live work.
- A daily rerun could overwrite manual content or call providers more than once if idempotency is not per output/date.
- Multiple local processes share SQLite, so finish/recovery ordering must not delete another live operation.

## Open Questions

None.
