# Workspace Diary / Docs / Token Hardening Test Plan

## Test Depth Route

- Level: 3
- Reason: Touches UI workflow, Core API routes, persistence, local filesystem read allowlist, and CLI log parser behavior.
- Required verification: Core unit/integration tests, UI API helper tests, Core typecheck, UI build, browser smoke/RWD.
- Allowed skips: Provider execution is skipped; tests use deterministic generators and persisted/log fixtures to avoid token spend.

## Bug Pattern Coverage

- [x] Input normalization / aliases / format variants: Claude path with `_`; project docs relative filenames.
- [x] Boundary values / empty / null / malformed input: invalid dates and unsafe docs filenames rejected by existing/new validation.
- [ ] Rule priority conflicts: not central to this slice.
- [ ] Negation / exclusion / opt-out / unlimited: not central to this slice.
- [x] Contract generated and execution applied: UI daily diary helpers call Core daily routes; scan consumes `project_doc_filenames`.
- [x] Operation order invariants: validate project/date/path before persistence or file read.
- [x] Production-like dirty data: parser supports actual Claude folder escaping seen on this machine.
- [ ] Multi-condition combinations: covered lightly through ranged daily snapshot writes.
- [x] Security bypass mixed with normal input: docs scan rejects `..` path traversal.
- [x] State/history/retry/refresh behavior: daily diary save/regenerate returns refreshed snapshot.
- [x] Externally observable result, not only implementation detail: browser smoke validates rendered controls.

## Runtime Verification Route

- Runtime smoke: REQUIRED
- Black-box QA: REQUIRED
- Safe environment or localhost command: `http://localhost:5173` with local Core on loopback.
- Safe test account / mock access: local SQLite + fixture-driven parser; no provider generation.
- Forbidden or destructive actions: no production service calls, no shell execution from project docs settings, no raw secret printing.

## [x] 【function 邏輯】Daily diary save writes the selected date
**範例輸入**：`saveProjectDiaryEntry(db, 1, "2026-06-28", { markdown })`
**期待輸出**：`daily_logs.per_project_summary["1"]` contains the markdown, status becomes `confirmed`, and the ranged diary snapshot shows the updated block.

## [x] 【狀態回歸】Daily diary saved markdown is returned exactly once
**範例輸入**：save `## 手動內容\n- 刪掉自動 session 文案。` for one date, then fetch that date.
**期待輸出**：diary block markdown equals the saved text; Core does not prepend another date heading or append another `本日 X 個 session` line.

## [x] 【function 邏輯】Daily diary regenerate does not overwrite project summary
**範例輸入**：project-level user summary exists, then regenerate `2026-06-28` daily diary with deterministic generator.
**期待輸出**：project summary remains `user`; daily diary block contains the regenerated daily markdown.

## [x] 【function 邏輯】Daily diary regenerate uses the selected date as snapshot date
**範例輸入**：server today is `2026-06-28`, regenerate daily diary for `2026-06-27`.
**期待輸出**：generator receives a custom-range snapshot whose `token_today` and diary block are for `2026-06-27`, not server today.

## [x] 【function 邏輯】Project docs scan uses settings allowlist
**範例輸入**：repo has `docs/specs/MASTER.md`; scan uses `projectDocFilenames: ["docs/specs/MASTER.md", "../secrets.md"]`.
**期待輸出**：Docs snapshot includes `docs/specs/MASTER.md`; unsafe path is ignored.

## [x] 【function 邏輯】Claude underscore path is discoverable
**範例輸入**：project root contains `Project_exception`; Claude folder uses hyphen escaping.
**期待輸出**：parser emits a Claude session with token usage.

## [x] 【Mock API】UI daily diary helpers call daily Core routes
**範例輸入**：`saveProjectDiaryEntry(3, "2026-07-01", markdown)` and `regenerateProjectDiaryEntry(...)`.
**期待輸出**：fetch calls `PUT /api/projects/3/diary/2026-07-01` and `POST /api/projects/3/diary/2026-07-01/regenerate`.

## [x] 【Mock API】CORS preflight allows PUT workspace save endpoints
**範例輸入**：`OPTIONS /api/projects/1/diary/2026-06-30` with `Origin: tauri://localhost` and `Access-Control-Request-Method: PUT`.
**期待輸出**：Core returns 204 and `Access-Control-Allow-Methods` includes `PUT`.

## [x] 【狀態回歸】Daily scheduler does not overwrite manually confirmed daily diary text
**範例輸入**：manual `saveProjectDiaryEntry` sets one project/day to `confirmed`, then Daily Scheduler runs for the same date.
**期待輸出**：that project/day keeps the manual markdown; generated per-project summaries can still fill other project ids.

## [x] 【前端元素】Summary controls show real mode, not hardcoded provider
**範例輸入**：open Projects -> Logs.
**期待輸出**：header shows project-level or daily-entry mode; no `Gemini-1.5-Pro Summarizer` or `Markdown aware` text.

## [x] 【前端元素】Comments Global option and light mode contrast
**範例輸入**：open Comments in light mode.
**期待輸出**：new comment tag dropdown includes Global; input surface is readable and not gray-washed.

## [x] 【前端元素】Kanban drag/drop has stable payload
**範例輸入**：drag a Kanban card to another column.
**期待輸出**：drop handler can persist status through Core API; card has HTML5 drag payload for webview reliability.

## [x] 【前端元素】Clearing a selected diary date restores project summary
**範例輸入**：click a daily diary block, then click clear date.
**期待輸出**：left editor title and preview return to project-level summary, with no selected daily date highlighted.

## [x] 【前端元素】Docs preview modal is large, readable, and rich-rendered
**範例輸入**：open Docs and click a scanned Markdown file in light mode.
**期待輸出**：modal uses a wide viewport, white/light surface, readable text, and rendered Markdown headings/lists/code instead of raw gray preformatted text.

## [x] 【前端元素】Token trend axis labels are not distorted by stretched SVG scaling
**範例輸入**：Dashboard token trend chart uses a wide panel.
**期待輸出**：axis labels render as normal app text outside the `preserveAspectRatio="none"` SVG layer.
