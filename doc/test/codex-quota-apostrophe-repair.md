# 額度事件彎撇號修復

ROOT CAUSE DEBUGGING
- Symptom: 兩個已註冊任務額度到期後仍 watching。
- Evidence: 正式 JSONL 皆是 event_msg/task_complete/usage_limit_exceeded，2026-09-20 15:09 發生、19:39 恢復；message 前綴為 You’ve，現 parser 只接受 You've，皆回 null。
- Fix boundary: 只明確接受 U+0027 與 U+2019 兩種官方前綴；不任意 Unicode normalize、不放寬結構／reset／時間／digest／重送條件。
- Route: 既有 O3 external-write 規格下的 bounded parser correction；Level4 recurring natural-language format，TDD、實際事件唯讀回放、independent QA REQUIRED。
- No UI change. 保留真實事件與註冊 offset；不插入假額度、不重設已消耗 evidence。

## Cases
- [x] straight/right-curly apostrophe 都解析相同 reset，原始行 digest 各自保留。
- [x] left-curly/fullwidth/backtick/前置文字／錯誤事件類型仍拒絕。
- [x] engine 對 curly event 只派送一次，第二 tick 不重播。
- [x] 正式兩筆事件在資料庫副本、禁止送出的 callback 上各符合派送資格。
- [x] independent public parser+engine QA、Core suite/type/build、新 DMG 與安裝版 hash。

殘餘：本次不修改 Codex 的額度，CLI 接受不代表工作完成。實際背景派送需獨立觀察。

## Fresh verification and installed result (2026-09-20)
- Core 378/378, UI 82/82, Core typecheck and Vite/Tauri package passed. First full run hit subprocess Node24/SQLite ABI mismatch; rerun with bundled Node22 first in PATH passed. Prior QA JSON absolute path hygiene failure fixed by repository-relative artifact reference; UI rerun passed.
- Independent /root/apostrophe_qa: 22/22 public parser/engine cases, exact one-line diff vs installed baseline, no findings.
- Installed parser SHA256 2755ef0a296b61d4a2758453cda58061296f1e5a246b7aa6d4eece17cd15eadf matches reviewed source and DMG. codesign strict verification passed.
- Previous app retained as DevDiary-before-apostrophe-20260920.app; SQLite backup retained in Application Support before replacement. Both original registrations preserved.
- Actual LaunchAgent processed both original 15:09 quota events once. Desktop started two new turns at 22:59:39 and 23:00:29; both stopped on a new usage_limit_exceeded response.
- Both fresh errors now correctly parsed; waiting_for_reset until 2026-09-21 02:03 Asia/Taipei. Actual automatic dispatch demonstrated; task completion and future quota availability not claimed.
- No UI change this repair, so no new browser gate. Previous queue change's independent-browser evidence limitation remains historical and is not falsely marked passed.
- No commit: large inseparable prior dirty feature WIP retained; no push/merge.

VERIFICATION REPORT
Revision: parser 2755ef0a296b61d4a2758453cda58061296f1e5a246b7aa6d4eece17cd15eadf; exact independent source hashes in codex-quota-apostrophe-independent-results.json
Target: installed macOS DevDiary and LaunchAgent
TestDepth: PASS
Build: PASS
Types: PASS
Lint: SKIPPED (no configured lint script; diff check passed)
Security: PASS (exact two-prefix allowlist, original digest, unchanged structural/time/replay guards)
Smoke: PASS (real event copy replay and installed automatic dispatch)
BlackBoxQA: PASS (22 independent fixture checks; no UI change)
Diff: REVIEWED
Overall: READY for bounded apostrophe repair; actual tasks currently waiting for new quota reset
