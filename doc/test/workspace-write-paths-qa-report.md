# QA Black-Box Report

- Environment: Localhost Core `127.0.0.1:4318` + Vite `127.0.0.1:5174`
- Revision / HEAD SHA: `d0bc1b1` plus uncommitted workspace-write-path changes
- Timestamp: 2026-06-29 12:54 Asia/Taipei
- Target URL / public entry: `http://127.0.0.1:5174`
- Test depth: Level 3
- Subagent attempt: yes
- Subagents used: attempted `019f11ba-da9d-7c30-8cdd-ccd9fa51ece9`
- Fallback reason: subagent failed with usage-limit error before producing QA output; main agent performed a separate black-box pass using public UI/API entry points.
- Result: PASS

## Scenarios

- [PASS] API project detail reachable
  - Steps: `GET /api/projects/1` through Vite proxy.
  - Expected result: 200 with selected project snapshot.
  - Actual result: 200 OK.

- [PASS] Comments create / pin / delete
  - Steps: UI opened Workspace -> 備忘錄留言, created `UI smoke comment from Core write path`, pinned it, deleted it.
  - Expected result: comment appears with `Core 已儲存`, moves to pinned order, then disappears after delete.
  - Actual result: UI reflected all three states; network showed `POST /comments` 201, `PATCH /comments/:id` 200, `DELETE /comments/:id` 200.

- [PASS] Kanban drag/drop persists through Core
  - Steps: UI opened Kanban and dragged `CLI Agent Log Parser` from TODO into DONE.
  - Expected result: TODO count decreases, DONE count increases, success toast appears.
  - Actual result: TODO `1 -> 0`, DONE `2 -> 3`, toast showed card moved; network showed `PATCH /kanban/:cardId` 200.

- [PASS] Summary save / AI draft / accept-draft flow
  - Steps: UI saved a manual Markdown summary, observed AI draft panel, clicked `接受 AI 草稿`.
  - Expected result: manual summary remains active until explicit accept; after accept, AI draft becomes active summary.
  - Actual result: manual summary displayed after save with an AI draft panel; after accept, main summary changed to AI draft and panel disappeared.

- [PASS] Invalid status is rejected
  - Steps: API smoke sent `PATCH /api/projects/1/kanban/:cardId` with `status=blocked`.
  - Expected result: 400 invalid body.
  - Actual result: 400 returned; no successful mutation was reported.

- [PASS] Console and network health
  - Steps: Playwright console warning check and network request list after UI flow.
  - Expected result: no browser console warnings/errors; API writes return 200/201.
  - Actual result: console reported 0 warnings/errors; relevant requests returned 200/201.

## Evidence

- Screenshots:
  - Desktop: `/tmp/codex-ui-shot-df89aa9b86f2.png`
  - Mobile: `/tmp/devdiary-workspace-write-mobile.png`
- Commands / artifacts:
  - API smoke via Node fetch against `http://127.0.0.1:5174`
  - Playwright UI flow against `http://127.0.0.1:5174`
- Console errors: none
- Network/API errors: none in changed success paths; deliberate invalid Kanban status returned 400 as expected.

## Findings

- Severity: none
- Reproduction steps: none
- Expected: n/a
- Actual: n/a

## Residual Risk

- AI regenerate is deterministic Core draft in this slice, not a real AI provider call. This is intentional until AI Diary Agent lands.
- Summary persistence uses `project_summaries` as the interim project-scoped override/draft store; full DiaryEntry persistence remains future work.
