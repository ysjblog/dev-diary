# Implementation Tasks: Remove DevDiary mobile RWD layout

## 中文摘要

本 Change 只處理 UI stylesheet 的 desktop-only 邊界：先完成 Spec Review 與使用者 acceptance，再以 source-level test 鎖定三段 mobile breakpoint 的移除，最後做 UI/API test、build 與 fresh desktop/narrow browser evidence。不改 Core、資料或既有 scheduler/scan WIP。

## Requirement Traceability

| Requirement | Design decision | Implementation task | Verification |
|---|---|---|---|
| Desktop-only presentation boundary | D1, D2 | 1.2, 2.1, 3.2 | app-shell source contract; fresh 390px and 768px+ browser evidence |
| Removing RWD rules does not change Core-backed behavior | D3 | 1.2, 2.2, 3.1 | existing UI/API tests, build, desktop smoke |

## 1. Spec and Test Preparation

- [x] 1.1 Run strict OpenSpec validation, fresh Author Preflight, and the applicable Spec Review Router; obtain user acceptance before any executable source change.
- [x] 1.2 Prepare a focused `src/api/appShell.test.js` contract that fails while any of the three mobile max-width layout blocks or alternate mobile notice/branch markers exist, and passes when the single desktop render path remains.

## 2. Implementation

- [x] 2.1 Remove the complete `@media (max-width: 1180px)`, `@media (max-width: 820px)`, and `@media (max-width: 640px)` layout blocks from `src/index.css`; do not add a narrow-screen notice, mobile markup, or JavaScript viewport gate.
- [x] 2.2 Confirm `src/App.jsx` remains unchanged and that Core-backed scan/status, scheduler, project, diary, Settings, export, and read-only Git routes are not altered.

## 3. Verification and Documentation

- [x] 3.1 Run `npm test`, `npm run build`, and `git diff --check`; record fresh results and confirm no scheduler/scan WIP was reverted or mixed into the patch.
- [x] 3.2 Run fresh browser checks at 390px and at least 768px: narrow view has no mobile-specific rearrangement or replacement notice, while desktop retains the existing workspace and controls. Treat narrow view as unsupported, not as a passing mobile workflow.
- [x] 3.3 After Execute is green, create the required independent Verify-QA task; only later reconcile current Feature Spec, `docs/specs/MASTER.md`, and archive readiness.

Archive readiness is BLOCKED: the active `fix-scan-status-and-daily-diary-scheduler` Delta specifies the opposite narrow-viewport notice/guard. The current Feature Spec remains unchanged until an explicit conflict decision; `docs/specs/MASTER.md` records this Closeout state.

## 4. Archive Blocker

- [ ] 4.1 Resolve the conflicting narrow-viewport contract with `fix-scan-status-and-daily-diary-scheduler`, then reconcile the current Feature Spec and archive this Change without mixing the scheduler/scan worktree changes.

## Verification

Before Execute, strict OpenSpec validation and Author Preflight must be fresh and Spec Review must be converged with user acceptance. After implementation, run the focused app-shell test, `npm test`, `npm run build`, and `git diff --check`; then capture fresh desktop and narrow browser evidence. No Core/API or data migration verification is required because those surfaces are intentionally unchanged.

## Open Questions

None.
