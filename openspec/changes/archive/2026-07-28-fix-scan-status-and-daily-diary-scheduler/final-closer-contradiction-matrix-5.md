# Final closer root-cause rollover 5

## Findings

- `SOL-BLAST-003`: scheduler still reached `project_daily_diaries.markdown` through its shared Workspace detail snapshot.
- `SOL-UI-001`: a pending composite scan request was displayed as optional AI synchronization even though the UI could not independently observe the Core scan terminal state.

## Contract contradiction

- Confirmed Project Daily diary text belongs only to `project_daily_diaries`; the global Daily highlight may use activity, Git, and Kanban facts but must not read that markdown.
- The scan control must describe an observable state. A pending HTTP request alone cannot prove that Core scan work has completed and optional AI work is the remaining step.

## Root cause

- The direct global projection writer had been cleaned up, but scheduler summary and diary generation still called a generic detail snapshot that populated diary text.
- The UI treated the outer request lifetime as if it were a Core lifecycle event.

## Bounded repair

- Add a scheduler-only no-diary snapshot mode, pass it through scheduler project generation, and build the global input from dedicated activity, Git, and Kanban queries. Keep only status reads and guarded diary writes required to preserve confirmation.
- Keep the desktop control in the scanning state until the composite request returns. Do not show an AI-specific state without a separately observable terminal transition.

## Verification strings

- `scheduler must not read project diary markdown`
- `正在掃描`
- `doesNotMatch(autoScanPolicySource, /正在同步 AI 建議/)`

## Scope boundary

Desktop-only. The user explicitly excluded mobile interface validation; no mobile/RWD check is added or required.
