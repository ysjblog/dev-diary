# Workspace Kanban / Comments / Docs Scan Test Plan

## Test Depth Route

- Level: 3
- Reason: Touches Workspace UI filters, Core settings persistence, local read-only filesystem scan, and Kanban synthesis state.
- Required verification: Core unit/integration tests, UI API helper tests, UI source contract tests, Core typecheck, UI build, localhost browser smoke/RWD, black-box QA.
- Allowed skips: No auth/payment/destructive workflows are touched, so Level 4 is not required.

## Bug Pattern Coverage

- [x] Input normalization / aliases / format variants: relative folder names are trimmed, deduped, and normalized.
- [x] Boundary values / empty / null / malformed input: empty folder list, absolute paths, `..`, oversized files.
- [x] Rule priority conflicts: explicit comment category filters win over all/project/global filters.
- [ ] Negation / exclusion / opt-out / unlimited: not central to this slice.
- [x] Contract generated and execution applied: settings snapshot includes folder rules and scan consumes them.
- [x] Operation order invariants: validate doc paths before filesystem reads or DB replacement.
- [x] Production-like dirty data: repeated synthesized sessions and legacy duplicate card sources.
- [x] Multi-condition combinations: filename scan + folder scan together.
- [x] Security bypass mixed with normal input: covered through path traversal and absolute path rejection.
- [x] State/history/retry/refresh behavior: repeated scan updates stable cards instead of adding duplicates.
- [x] Externally observable result, not only implementation detail: browser smoke checks Settings, Comments, Kanban, Docs.

## Runtime Verification Route

- Runtime smoke: REQUIRED
- Black-box QA: REQUIRED
- Safe environment or localhost command: `http://localhost:5173` with local loopback Core.
- Safe test account / mock access: local SQLite / fixture temp folders only.
- Forbidden or destructive actions: no project folder writes, no production services, no secret printing.

## [x] 【function 邏輯】Kanban repeated session synthesis updates one stable card
**範例輸入**：same project has multiple Codex sessions, then synthesizer runs twice.
**期待輸出**：one `agent-synth://p1/session/codex-cli` style card is updated, not duplicated.

## [x] 【function 邏輯】Dirty worktree does not generate generic todo card
**範例輸入**：snapshot has clean sessions and dirty git status.
**期待輸出**：no card titled `收斂目前未提交變更`; Git status remains available in Git tab.

## [x] 【function 邏輯】Project docs folder settings persist and validate
**範例輸入**：PATCH settings with `project_doc_folders: ["docs", "../private"]`.
**期待輸出**：safe `docs` persists; traversal is rejected.

## [x] 【function 邏輯】Folder scan reads files under safe relative folders
**範例輸入**：project has `docs/a.md` and `docs/nested/b.md`; scan uses `projectDocFolders: ["docs"]`.
**期待輸出**：Docs snapshot includes both files and ignores unsafe / oversized / hidden paths.

## [x] 【Mock API】Settings form round-trips filename and folder scan lists
**範例輸入**：settings snapshot contains `project_doc_filenames` and `project_doc_folders`.
**期待輸出**：form state and PATCH payload preserve both arrays separately.

## [x] 【前端元素】Comments category filter buttons match forced categories
**範例輸入**：open Comments tab.
**期待輸出**：filter row includes All, Global, Project, Pinned, UI/UX, Bug, Feature, Info; it does not include 未分類.

## [x] 【前端元素】Settings Project Docs Scan distinguishes modes
**範例輸入**：open Settings -> Projects.
**期待輸出**：filename allowlist and folder full scan controls are separate, with distinct labels and add buttons.

## [x] 【前端元素】Kanban empty columns are intentional states
**範例輸入**：a project has no todo or in-progress cards after generic cards are removed.
**期待輸出**：column shows a compact empty state instead of looking broken.

## [x] 【RWD】Workspace and Settings remain usable on desktop and mobile
**範例輸入**：1440x900 and 390x844 viewports.
**期待輸出**：no horizontal overflow; settings path rows and comment filter buttons wrap cleanly.
